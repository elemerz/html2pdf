package nl.infomedics.reporting.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.FileVisitResult;
import java.nio.file.SimpleFileVisitor;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Monitors the input directory for marker files and delegates conversion work to {@link Html2PdfConverterService}.
 */
@Service
public class FolderWatcherService {

    private final Html2PdfConverterService converterService;
    private final Path inputRoot;
    private volatile Thread watcherThread;
    private volatile boolean initialScanScheduled;

    public FolderWatcherService(Html2PdfConverterService converterService,
                                @Value("${input.path.html}") String htmlInputPath) {
        this.converterService = converterService;
        this.inputRoot = htmlInputPath == null ? null : Paths.get(htmlInputPath).toAbsolutePath().normalize();
    }

    /**
     * Ensures the converter is warmed up, schedules pre-existing marker files and starts the watch loop.
     */
    public void startWatching() {
        if (inputRoot == null) {
            System.err.println("Input path is not configured; folder watching disabled.");
            return;
        }
        converterService.warmUpIfConfigured();
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
                        } else if (converterService.isMarkerFile(child)) {
                            converterService.submitMarker(child);
                        }
                    } else if (kind == StandardWatchEventKinds.ENTRY_MODIFY && Files.isRegularFile(child)) {
                        if (converterService.isMarkerFile(child)) {
                            converterService.submitMarker(child);
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
                    .filter(converterService::isMarkerFile)
                    .forEach(converterService::submitMarker);
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
                    .filter(converterService::isMarkerFile)
                    .forEach(converterService::submitMarker);
        } catch (IOException e) {
            System.err.println("Unable to scan directory " + directory + " for markers: " + e.getMessage());
        }
    }
}
