package nl.infomedics.invoicing.service;

import nl.infomedics.invoicing.service.InvoiceProcessorClient.PdfConversionException;
import nl.infomedics.invoicing.service.InvoiceProcessorClient.PdfConversionResult;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystems;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.WatchEvent;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.nio.file.StandardWatchEventKinds;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * Monitors the input directory for marker files, materialises file contents, and delegates conversion to
 * {@link InvoiceProcessorClient}.
 */
@Service
public class FolderWatcherService {

    private static final int READ_RETRY_ATTEMPTS = 10;
    private static final long READ_RETRY_DELAY_MS = 150L;
    private static final DateTimeFormatter TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final InvoiceProcessorClient invoiceProcessorClient;
    private final ThreadPoolExecutor conversionExecutor;
    private final Semaphore conversionPermits;
    private final int maxConcurrentConversions;
    private final Path inputRoot;
    private final Path outputRoot;
    private final Path failedOutputRoot;
    private final boolean debugEnabled;
    private final String warmupHtml;

    private volatile Thread watcherThread;
    private volatile boolean initialScanScheduled;
    private volatile boolean warmupAttempted;

    public FolderWatcherService(InvoiceProcessorClient invoiceProcessorClient,
                                @Value("${input.path.html}") String htmlInputPath,
                                @Value("${output.path.pdf}") String pdfOutputPath,
                                @Value("${failed.path.pdf}") String failedOutputPath,
                                @Value("${warmup.html:}") String warmupHtml,
                                @Value("${debug:false}") boolean debugEnabled,
                                @Value("${folder.watcher.max-concurrent:64}") int maxConcurrent) {
        this.invoiceProcessorClient = invoiceProcessorClient;
        this.inputRoot = normalisePath(htmlInputPath);
        this.outputRoot = normalisePath(pdfOutputPath);
        this.failedOutputRoot = normalisePath(failedOutputPath);
        this.warmupHtml = warmupHtml == null ? "" : warmupHtml;
        this.debugEnabled = debugEnabled;
        this.maxConcurrentConversions = Math.max(1, maxConcurrent);
        this.conversionPermits = new Semaphore(this.maxConcurrentConversions);
        
        // Create thread pool with bounded queue to prevent memory issues
        int queueCapacity = this.maxConcurrentConversions * 4; // 256 for default 64
        this.conversionExecutor = new ThreadPoolExecutor(
                this.maxConcurrentConversions,
                this.maxConcurrentConversions,
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(queueCapacity),
                r -> {
                    Thread thread = new Thread(r);
                    thread.setName("conversion-worker-" + thread.getId());
                    thread.setDaemon(false);
                    return thread;
                },
                new ThreadPoolExecutor.CallerRunsPolicy() // If queue full, caller processes it
        );
        System.out.println("FolderWatcherService initialized with max " + this.maxConcurrentConversions + " concurrent conversions, queue capacity: " + queueCapacity);
    }

    /**
     * Ensures the converter is warmed up, schedules pre-existing marker files and starts the watch loop.
     */
    public void startWatching() {
        if (inputRoot == null) {
            System.err.println("Input path is not configured; folder watching disabled.");
            return;
        }
        runWarmupIfConfigured();
        scheduleExistingFiles();
        synchronized (this) {
            if (watcherThread == null || !watcherThread.isAlive()) {
                watcherThread = Thread.ofPlatform()
                        .name("html2pdf-watch")
                        .start(this::watchFolder);
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        System.out.println("Shutting down FolderWatcherService...");
        conversionExecutor.shutdown();
        try {
            if (!conversionExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                System.err.println("Forcing shutdown of conversion executor...");
                conversionExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            conversionExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
        if (watcherThread != null && watcherThread.isAlive()) {
            watcherThread.interrupt();
        }
    }

    private void watchFolder() {
        try (WatchService watchService = FileSystems.getDefault().newWatchService()) {
            Map<WatchKey, Path> watchKeys = new HashMap<>();
            registerAllDirectories(inputRoot, watchService, watchKeys);

            System.out.println("Watching folder: " + inputRoot);
            while (true) {
                WatchKey key = watchService.take();
                Path dir = watchKeys.get(key);
                if (dir == null) {
                    key.reset();
                    continue;
                }

                boolean overflowDetected = false;
                for (WatchEvent<?> event : key.pollEvents()) {
                    WatchEvent.Kind<?> kind = event.kind();
                    if (kind == StandardWatchEventKinds.OVERFLOW) {
                        System.err.println("!!! WATCH SERVICE OVERFLOW DETECTED !!!");
                        System.err.println("Too many file system events at once - rescanning directory: " + dir);
                        overflowDetected = true;
                        break; // Stop processing this batch, will rescan
                    }
                    Path relative = (Path) event.context();
                    if (relative == null) {
                        continue;
                    }
                    Path child = dir.resolve(relative);
                    if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
                        if (Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) {
                            registerAllDirectories(child, watchService, watchKeys);
                            submitExistingMarkers(child);
                        } else if (isMarkerFile(child)) {
                            submitMarker(child);
                        }
                    } else if (kind == StandardWatchEventKinds.ENTRY_MODIFY && Files.isRegularFile(child)) {
                        if (isMarkerFile(child)) {
                            submitMarker(child);
                        }
                    }
                }

                if (overflowDetected) {
                    // Rescan the entire directory to pick up missed files
                    System.err.println("Rescanning directory after overflow: " + dir);
                    submitExistingMarkers(dir);
                }

                boolean valid = key.reset();
                if (!valid) {
                    watchKeys.remove(key);
                    if (watchKeys.isEmpty()) {
                        break;
                    }
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } catch (IOException ioe) {
            System.err.println("Watcher stopped due to I/O error: " + ioe.getMessage());
        }
    }

    private void submitMarker(Path markerFile) {
        if (markerFile == null) {
            return;
        }
        try {
            conversionExecutor.submit(() -> {
                boolean acquired = false;
                try {
                    acquired = conversionPermits.tryAcquire(30, TimeUnit.SECONDS);
                    if (!acquired) {
                        System.err.println("Unable to acquire conversion permit for " + markerFile + " after 30 seconds");
                        logExecutorState();
                        Path htmlFile = resolveHtmlForMarker(markerFile);
                        movePairToFailed(htmlFile, markerFile);
                        return;
                    }
                    processMarker(markerFile);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    System.err.println("Interrupted while processing " + markerFile);
                    Path htmlFile = resolveHtmlForMarker(markerFile);
                    movePairToFailed(htmlFile, markerFile);
                } catch (Exception e) {
                    System.err.println("Unexpected error processing " + markerFile + ": " + e.getMessage());
                    e.printStackTrace();
                    Path htmlFile = resolveHtmlForMarker(markerFile);
                    movePairToFailed(htmlFile, markerFile);
                } finally {
                    if (acquired) {
                        conversionPermits.release();
                    }
                }
            });
        } catch (RejectedExecutionException e) {
            System.err.println("Executor rejected task for " + markerFile + " (queue full or shutdown)");
            logExecutorState();
            Path htmlFile = resolveHtmlForMarker(markerFile);
            movePairToFailed(htmlFile, markerFile);
        }
    }

    private void logExecutorState() {
        int availablePermits = conversionPermits.availablePermits();
        int queuedTasks = conversionExecutor.getQueue().size();
        int activeThreads = conversionExecutor.getActiveCount();
        long completedTasks = conversionExecutor.getCompletedTaskCount();
        
        System.err.println("EXECUTOR STATE:");
        System.err.println("  Available permits: " + availablePermits + "/" + maxConcurrentConversions);
        System.err.println("  Active threads: " + activeThreads + "/" + maxConcurrentConversions);
        System.err.println("  Queued tasks: " + queuedTasks);
        System.err.println("  Completed tasks: " + completedTasks);
    }

    private void processMarker(Path markerFile) {
        Path htmlFile = null;
        try {
            if (markerFile == null || !Files.exists(markerFile)) {
                return;
            }
            htmlFile = resolveHtmlForMarker(markerFile);
            if (htmlFile == null || !Files.exists(htmlFile)) {
                System.err.println("Marker " + markerFile + " found but corresponding HTML/XHTML file is missing.");
                return;
            }

            String htmlContent = readHtmlContent(htmlFile);
            if (htmlContent == null) {
                movePairToFailed(htmlFile, markerFile);
                return;
            }

            String baseName = stripExtension(htmlFile.getFileName().toString());
            if (baseName == null || baseName.isBlank()) {
                baseName = "document";
            }

            Path pdfFile = resolvePdfOutputPath(htmlFile, baseName);
            Path pdfParent = pdfFile.getParent();
            if (pdfParent != null) {
                Files.createDirectories(pdfParent);
            } else if (outputRoot != null) {
                Files.createDirectories(outputRoot);
            }

            PdfConversionResult result = invoiceProcessorClient.convertHtmlToPdf(htmlContent);
            try (OutputStream os = Files.newOutputStream(pdfFile, StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                os.write(result.pdfContent());
            }

            System.out.println("Converted: " + htmlFile + " -> " + pdfFile);
            if (debugEnabled && result.sanitisedXhtml() != null) {
                Path intermediateHtml = writeIntermediateHtml(pdfFile, baseName, result.sanitisedXhtml());
                System.out.println("Intermediate HTML saved to: " + intermediateHtml);
            }

            deleteIfExists(htmlFile);
            deleteIfExists(markerFile);
            String timestamp = LocalTime.now().format(TIMESTAMP_FORMATTER);
            System.out.println(timestamp + " Conversion completed for marker " + markerFile);
        } catch (PdfConversionException e) {
            System.err.println("Error converting " + markerFile + ": " + e.getMessage());
            movePairToFailed(htmlFile, markerFile);
        } catch (Exception ex) {
            System.err.println("Unexpected error processing marker " + markerFile + ": " + ex.getMessage());
            movePairToFailed(htmlFile, markerFile);
        }
    }

    private String readHtmlContent(Path htmlFile) {
        for (int attempt = 1; attempt <= READ_RETRY_ATTEMPTS; attempt++) {
            try {
                return Files.readString(htmlFile, StandardCharsets.UTF_8);
            } catch (IOException ex) {
                if (attempt == READ_RETRY_ATTEMPTS) {
                    System.err.println("Unable to read " + htmlFile + " after "
                            + READ_RETRY_ATTEMPTS + " attempts: " + ex.getMessage());
                } else {
                    try {
                        Thread.sleep(READ_RETRY_DELAY_MS);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        return null;
    }

    private Path resolvePdfOutputPath(Path htmlFile, String baseName) {
        if (outputRoot == null) {
            throw new IllegalStateException("PDF output path is not configured.");
        }
        Path htmlAbsolute = htmlFile.toAbsolutePath().normalize();
        Path relative;
        try {
            relative = inputRoot.relativize(htmlAbsolute);
        } catch (IllegalArgumentException ex) {
            relative = htmlAbsolute.getFileName();
        }

        Path relativeDir = relative != null ? relative.getParent() : null;
        Path targetDir = relativeDir != null ? outputRoot.resolve(relativeDir) : outputRoot;
        return targetDir.resolve(baseName + ".pdf");
    }

    private void runWarmupIfConfigured() {
        if (warmupAttempted) {
            return;
        }
        warmupAttempted = true;
        String warmupSource = warmupHtml.trim();
        if (warmupSource.isEmpty()) {
            return;
        }
        try {
            invoiceProcessorClient.convertHtmlToPdf(warmupSource);
            System.out.println("Warm-up conversion completed.");
        } catch (PdfConversionException ex) {
            System.err.println("Warm-up conversion failed: " + ex.getMessage());
        }
    }

    private void scheduleExistingFiles() {
        if (inputRoot == null || !Files.isDirectory(inputRoot)) {
            return;
        }
        synchronized (this) {
            if (initialScanScheduled) {
                return;
            }
            initialScanScheduled = true;
        }
        
        // Process existing files in a separate thread to avoid blocking the watcher
        Thread.ofPlatform().name("initial-scan").start(() -> {
            System.out.println("Starting initial scan of existing files in " + inputRoot);
            try (Stream<Path> files = Files.walk(inputRoot)) {
                files.filter(Files::isRegularFile)
                        .filter(this::isMarkerFile)
                        .forEach(marker -> {
                            submitMarker(marker);
                            // Small delay to avoid overwhelming the executor
                            try {
                                Thread.sleep(10);
                            } catch (InterruptedException e) {
                                Thread.currentThread().interrupt();
                            }
                        });
                System.out.println("Initial scan completed");
            } catch (IOException e) {
                System.err.println("Unable to process existing HTML files in " + inputRoot + ": " + e.getMessage());
            }
        });
    }

    private void submitExistingMarkers(Path directory) {
        if (directory == null) {
            return;
        }
        try (Stream<Path> files = Files.list(directory)) {
            files.filter(Files::isRegularFile)
                    .filter(this::isMarkerFile)
                    .forEach(this::submitMarker);
        } catch (IOException e) {
            System.err.println("Unable to scan directory " + directory + " for markers: " + e.getMessage());
        }
    }

    private Path resolveHtmlForMarker(Path markerFile) {
        if (markerFile == null) {
            return null;
        }
        String baseName = stripExtension(markerFile.getFileName().toString());
        if (baseName == null) {
            return null;
        }
        Path directory = markerFile.getParent();
        if (directory == null) {
            directory = markerFile.toAbsolutePath().getParent();
        }
        if (directory == null) {
            return null;
        }
        String[] extensions = {".xhtml", ".html"};
        for (String extension : extensions) {
            Path candidate = directory.resolve(baseName + extension);
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private Path writeIntermediateHtml(Path pdfFile, String baseName, String sanitisedXhtml) {
        Path debugDir = pdfFile.getParent();
        if (debugDir == null) {
            debugDir = outputRoot != null ? outputRoot : Paths.get(".").toAbsolutePath().normalize();
        }
        Path debugFile = debugDir.resolve(baseName + "-intermediate.xhtml");
        try (OutputStream out = Files.newOutputStream(debugFile, StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
            out.write(sanitisedXhtml.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            System.err.println("Unable to write intermediate HTML: " + e.getMessage());
        }
        return debugFile;
    }

    private void deleteIfExists(Path file) {
        if (file == null) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            System.err.println("Unable to delete file " + file + ": " + e.getMessage());
        }
    }

    private void movePairToFailed(Path htmlFile, Path markerFile) {
        if (failedOutputRoot == null) {
            System.err.println("failed.path.pdf is not configured; leaving files in place for manual review.");
            return;
        }
        moveFileToDirectory(htmlFile, failedOutputRoot);
        moveFileToDirectory(markerFile, failedOutputRoot);
    }

    private void moveFileToDirectory(Path source, Path targetDir) {
        if (source == null || targetDir == null) {
            return;
        }
        try {
            if (!Files.exists(source)) {
                return;
            }
            Files.createDirectories(targetDir);
            String originalName = source.getFileName().toString();
            Path destination = targetDir.resolve(originalName);
            if (Files.exists(destination)) {
                destination = resolveUniqueDestination(targetDir, originalName);
            }
            Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            System.err.println("Unable to move " + source + " to " + targetDir + ": " + e.getMessage());
        }
    }

    private Path resolveUniqueDestination(Path directory, String originalName) throws IOException {
        String base = stripExtension(originalName);
        String extension = "";
        int idx = originalName.lastIndexOf('.');
        if (idx >= 0) {
            extension = originalName.substring(idx);
        }
        int attempt = 1;
        Path candidate;
        do {
            candidate = directory.resolve(base + "-" + System.currentTimeMillis() + "-" + attempt + extension);
            attempt++;
        } while (Files.exists(candidate));
        return candidate;
    }

    private boolean isMarkerFile(Path file) {
        if (file == null) {
            return false;
        }
        String lowerName = file.getFileName().toString().toLowerCase();
        return lowerName.endsWith(".txt");
    }

    private String stripExtension(String name) {
        if (name == null) {
            return null;
        }
        int idx = name.lastIndexOf('.');
        if (idx > 0) {
            return name.substring(0, idx);
        }
        return name;
    }

    private void registerAllDirectories(Path start, WatchService watchService, Map<WatchKey, Path> watchKeys) throws IOException {
        if (start == null) {
            return;
        }
        if (!Files.exists(start)) {
            try {
                Files.createDirectories(start);
            } catch (IOException ioe) {
                System.err.println("Unable to create input directory " + start + ": " + ioe.getMessage());
                return;
            }
        }
        Files.walkFileTree(start, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                registerDirectory(dir, watchService, watchKeys);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                System.err.println("Unable to access " + file + ": " + exc.getMessage());
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private void registerDirectory(Path dir, WatchService watchService, Map<WatchKey, Path> watchKeys) throws IOException {
        if (dir == null) {
            return;
        }
        if (watchKeys.containsValue(dir)) {
            return;
        }
        WatchKey key = dir.register(watchService, StandardWatchEventKinds.ENTRY_CREATE, StandardWatchEventKinds.ENTRY_MODIFY);
        watchKeys.put(key, dir);
    }

    private Path normalisePath(String rawPath) {
        if (rawPath == null || rawPath.trim().isEmpty()) {
            return null;
        }
        return Paths.get(rawPath).toAbsolutePath().normalize();
    }
}
