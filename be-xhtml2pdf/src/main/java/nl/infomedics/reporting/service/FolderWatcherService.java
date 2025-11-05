package nl.infomedics.reporting.service;

import nl.infomedics.reporting.service.Html2PdfConverterService.HtmlToPdfConversionException;
import nl.infomedics.reporting.service.Html2PdfConverterService.PdfConversionResult;
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
import java.util.stream.Stream;

/**
 * Monitors the input directory for marker files, materialises file contents, and delegates conversion to
 * {@link Html2PdfConverterService}.
 */
@Service
public class FolderWatcherService {

    private static final int READ_RETRY_ATTEMPTS = 10;
    private static final long READ_RETRY_DELAY_MS = 150L;
    private static final DateTimeFormatter TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final Html2PdfConverterService converterService;
    private final ExecutorService conversionExecutor = Executors.newVirtualThreadPerTaskExecutor();
    private final Path inputRoot;
    private final Path outputRoot;
    private final Path failedOutputRoot;
    private final boolean debugEnabled;
    private final String warmupHtml;

    private volatile Thread watcherThread;
    private volatile boolean initialScanScheduled;
    private volatile boolean warmupAttempted;

    public FolderWatcherService(Html2PdfConverterService converterService,
                                @Value("${input.path.html}") String htmlInputPath,
                                @Value("${output.path.pdf}") String pdfOutputPath,
                                @Value("${failed.path.pdf}") String failedOutputPath,
                                @Value("${warmup.html:}") String warmupHtml,
                                @Value("${debug:false}") boolean debugEnabled) {
        this.converterService = converterService;
        this.inputRoot = normalisePath(htmlInputPath);
        this.outputRoot = normalisePath(pdfOutputPath);
        this.failedOutputRoot = normalisePath(failedOutputPath);
        this.warmupHtml = warmupHtml == null ? "" : warmupHtml;
        this.debugEnabled = debugEnabled;
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

                for (WatchEvent<?> event : key.pollEvents()) {
                    WatchEvent.Kind<?> kind = event.kind();
                    if (kind == StandardWatchEventKinds.OVERFLOW) {
                        continue;
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
        conversionExecutor.submit(() -> processMarker(markerFile));
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

            PdfConversionResult result = converterService.convertHtmlToPdf(htmlContent);
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
        } catch (HtmlToPdfConversionException e) {
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
            converterService.convertHtmlToPdf(warmupSource);
            System.out.println("Warm-up conversion completed.");
        } catch (HtmlToPdfConversionException ex) {
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
        try (Stream<Path> files = Files.walk(inputRoot)) {
            files.filter(Files::isRegularFile)
                    .filter(this::isMarkerFile)
                    .forEach(this::submitMarker);
        } catch (IOException e) {
            System.err.println("Unable to process existing HTML files in " + inputRoot + ": " + e.getMessage());
        }
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
