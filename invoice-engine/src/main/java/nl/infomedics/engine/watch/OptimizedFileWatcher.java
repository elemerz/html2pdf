package nl.infomedics.engine.watch;

import java.io.IOException;
import java.nio.file.*;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import nl.infomedics.engine.config.EngineProperties;
import nl.infomedics.engine.core.InvoiceProcessor;
import nl.infomedics.engine.metrics.DiagnosticsRecorder;

@Slf4j
@Component
public class OptimizedFileWatcher implements ApplicationRunner {

    private static final String ZIP_EXTENSION = ".zip";
    private static final String MARKER_EXTENSION = ".txt";

    private final EngineProperties properties;
    private final InvoiceProcessor processor;
    private final DiagnosticsRecorder diagnostics;
    private final ExecutorService ioExecutor;
    
    private volatile Thread watcherThread;
    private volatile ScheduledExecutorService fallbackScheduler;
    private final Map<Path, ScheduledFuture<?>> pendingMarkers = new ConcurrentHashMap<>();
    private final BlockingQueue<Path> markerQueue;

    public OptimizedFileWatcher(EngineProperties properties,
                                InvoiceProcessor processor,
                                DiagnosticsRecorder diagnostics,
                                ExecutorService ioExecutor) {
        this.properties = properties;
        this.processor = processor;
        this.diagnostics = diagnostics;
        this.ioExecutor = ioExecutor;
        this.markerQueue = new LinkedBlockingQueue<>(properties.getWatch().getBatchSize() * 2);
        
        log.info("OptimizedFileWatcher initialized: debounce={}ms, batchSize={}",
                properties.getWatch().getDebounceMillis(),
                properties.getWatch().getBatchSize());
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        Path inputDir = Paths.get(properties.getInput().getFolder());
        Files.createDirectories(inputDir);
        Files.createDirectories(Paths.get(properties.getInput().getArchiveFolder()));
        Files.createDirectories(Paths.get(properties.getInput().getErrorFolder()));
        Files.createDirectories(Paths.get(properties.getOutput().getPdfFolder()));
        
        if (properties.getOutput().isSaveJson()) {
            Files.createDirectories(Paths.get(properties.getOutput().getJsonFolder()));
        }

        // Initialize fallback scheduler FIRST (needed by debounceMarker)
        int pollSeconds = properties.getWatch().getFallbackPollSeconds();
        fallbackScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "fallback-scanner");
            t.setDaemon(true);
            return t;
        });

        log.info("Starting initial scan of {}", inputDir);
        try (var timer = diagnostics.start("engine.watch.initial-scan", Map.of())) {
            scanExistingMarkers(inputDir);
        }

        // Start event-driven watcher
        watcherThread = new Thread(() -> watchFolder(inputDir), "file-watcher");
        watcherThread.setDaemon(false);
        watcherThread.start();

        // Start batch processor
        ioExecutor.submit(this::processBatches);

        // Start fallback periodic rescan (safety net)
        fallbackScheduler.scheduleAtFixedRate(() -> rescan(inputDir), pollSeconds, pollSeconds, TimeUnit.SECONDS);
        
        log.info("File watcher started successfully");
    }

    private void watchFolder(Path inputDir) {
        try (WatchService watchService = FileSystems.getDefault().newWatchService()) {
            inputDir.register(watchService,
                    StandardWatchEventKinds.ENTRY_CREATE,
                    StandardWatchEventKinds.ENTRY_MODIFY);

            log.info("Watching {} for marker files", inputDir);

            while (!Thread.interrupted()) {
                WatchKey key = watchService.poll(500, TimeUnit.MILLISECONDS);
                if (key == null) continue;

                for (WatchEvent<?> event : key.pollEvents()) {
                    WatchEvent.Kind<?> kind = event.kind();

                    if (kind == StandardWatchEventKinds.OVERFLOW) {
                        log.warn("Watch service overflow detected - rescanning directory");
                        scanExistingMarkers(inputDir);
                        continue;
                    }

                    Path relative = (Path) event.context();
                    if (relative == null) continue;
                    
                    Path child = inputDir.resolve(relative);

                    if ((kind == StandardWatchEventKinds.ENTRY_CREATE || 
                         kind == StandardWatchEventKinds.ENTRY_MODIFY) &&
                        Files.isRegularFile(child) &&
                        isMarker(child)) {
                        
                        debounceMarker(child);
                    }
                }

                key.reset();
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            log.info("File watcher interrupted");
        } catch (IOException ioe) {
            log.error("File watcher stopped due to I/O error", ioe);
        }
    }

    private void debounceMarker(Path marker) {
        int debounceMs = properties.getWatch().getDebounceMillis();
        
        pendingMarkers.compute(marker, (k, existingFuture) -> {
            if (existingFuture != null) {
                existingFuture.cancel(false);
            }
            
            return fallbackScheduler.schedule(() -> {
                try {
                    markerQueue.offer(marker, 1, TimeUnit.SECONDS);
                    pendingMarkers.remove(marker);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }, debounceMs, TimeUnit.MILLISECONDS);
        });
    }

    private void processBatches() {
        int batchSize = properties.getWatch().getBatchSize();
        
        while (!Thread.interrupted()) {
            try {
                Path firstMarker = markerQueue.poll(1, TimeUnit.SECONDS);
                if (firstMarker == null) continue;

                java.util.List<Path> batch = new java.util.ArrayList<>();
                batch.add(firstMarker);
                markerQueue.drainTo(batch, batchSize - 1);

                if (batch.size() > 1) {
                    log.info("Processing batch of {} markers", batch.size());
                }

                try (var timer = diagnostics.start("engine.watch.batch", 
                        Map.of("size", String.valueOf(batch.size())))) {
                    for (Path marker : batch) {
                        processMarker(marker);
                    }
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private void processMarker(Path marker) {
        try {
            if (!Files.exists(marker)) {
                return;
            }

            long size = Files.size(marker);
            if (size != 0L) {
                log.warn("Marker {} ignored - not empty ({} bytes)", marker.getFileName(), size);
                return;
            }

            Path zipPath = toZipSibling(marker);
            if (!Files.exists(zipPath)) {
                log.warn("Marker {} present but zip {} missing", 
                        marker.getFileName(), zipPath.getFileName());
                return;
            }

            deleteMarker(marker);
            processor.processZipFile(zipPath);

        } catch (Exception e) {
            log.error("Failed to process marker {}", marker, e);
            moveToError(marker);
        }
    }

    private void scanExistingMarkers(Path directory) {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory, "*" + MARKER_EXTENSION)) {
            AtomicInteger count = new AtomicInteger();
            stream.forEach(marker -> {
                debounceMarker(marker);
                count.incrementAndGet();
            });
            
            if (count.get() > 0) {
                log.info("Found {} existing marker(s)", count.get());
            }
        } catch (IOException e) {
            log.warn("Failed to scan directory {}", directory, e);
        }
    }

    private void rescan(Path directory) {
        log.debug("Performing fallback rescan");
        scanExistingMarkers(directory);
    }

    private void moveToError(Path marker) {
        try {
            Path errorDir = Paths.get(properties.getInput().getErrorFolder());
            Files.createDirectories(errorDir);
            Path destination = errorDir.resolve(marker.getFileName());
            Files.move(marker, destination, StandardCopyOption.REPLACE_EXISTING);
            log.info("Moved {} to error folder", marker.getFileName());
        } catch (IOException e) {
            log.error("Failed to move {} to error folder", marker, e);
        }
    }

    private static boolean isMarker(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return name.endsWith(MARKER_EXTENSION);
    }

    private static Path toZipSibling(Path marker) {
        String markerName = marker.getFileName().toString();
        String baseName = markerName.substring(0, markerName.length() - MARKER_EXTENSION.length());
        return marker.resolveSibling(baseName + ZIP_EXTENSION);
    }

    private static void deleteMarker(Path marker) {
        for (int i = 0; i < 5; i++) {
            try {
                Files.deleteIfExists(marker);
                return;
            } catch (IOException e) {
                if (i == 4) {
                    log.warn("Unable to delete marker {} after 5 attempts", marker.getFileName());
                } else {
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down file watcher...");

        if (fallbackScheduler != null) {
            fallbackScheduler.shutdown();
        }

        if (watcherThread != null && watcherThread.isAlive()) {
            watcherThread.interrupt();
        }

        pendingMarkers.values().forEach(future -> future.cancel(false));
        pendingMarkers.clear();

        log.info("File watcher shutdown complete");
    }
}
