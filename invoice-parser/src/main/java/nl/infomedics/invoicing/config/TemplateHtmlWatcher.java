package nl.infomedics.invoicing.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;

import java.io.IOException;
import java.nio.file.ClosedWatchServiceException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.WatchEvent;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

import static java.nio.file.StandardWatchEventKinds.ENTRY_CREATE;
import static java.nio.file.StandardWatchEventKinds.ENTRY_DELETE;
import static java.nio.file.StandardWatchEventKinds.ENTRY_MODIFY;

/**
 * Watches the for-pdf templates folder and triggers a full reload of the in-memory map
 * whenever a template changes. Only works when templates are loaded from the filesystem
 * (e.g. running from IDE or exploded build).
 */
public class TemplateHtmlWatcher implements SmartLifecycle {
    private static final Logger log = LoggerFactory.getLogger(TemplateHtmlWatcher.class);

    private final Path templatesDir;
    private final Runnable reloadAction;
    private final AtomicBoolean running = new AtomicBoolean(false);

    private WatchService watchService;
    private Thread watcherThread;

    public TemplateHtmlWatcher(Path templatesDir, Runnable reloadAction) {
        this.templatesDir = Objects.requireNonNull(templatesDir, "templatesDir").toAbsolutePath().normalize();
        this.reloadAction = Objects.requireNonNull(reloadAction, "reloadAction");
    }

    @Override
    public void start() {
        if (running.get() || !resolveTemplatesDir()) {
            return;
        }
        try {
            watchService = templatesDir.getFileSystem().newWatchService();
            templatesDir.register(watchService, ENTRY_CREATE, ENTRY_MODIFY, ENTRY_DELETE);
            watcherThread = new Thread(this::watchLoop, "template-html-watcher");
            watcherThread.setDaemon(true);
            watcherThread.start();
            running.set(true);
            log.info("Watching template folder for changes: {}", templatesDir);
        } catch (IOException e) {
            log.warn("Template watching disabled (failed to register watcher): {}", e.getMessage());
            closeWatcher();
        }
    }

    private boolean resolveTemplatesDir() {
        try {
            if (!Files.exists(templatesDir)) {
                Files.createDirectories(templatesDir);
            }
            if (Files.isDirectory(templatesDir)) {
                return true;
            }
            log.warn("Template watching disabled: {} is not a directory", templatesDir);
        } catch (IOException e) {
            log.warn("Could not resolve templates directory for watching: {}", e.getMessage());
        }
        return false;
    }

    private void watchLoop() {
        try {
            while (running.get()) {
                WatchKey key;
                try {
                    key = watchService.take();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (ClosedWatchServiceException cwse) {
                    break;
                }

                boolean relevantChange = false;
                for (WatchEvent<?> event : key.pollEvents()) {
                    Object ctx = event.context();
                    if (ctx instanceof Path changed) {
                        String name = changed.getFileName().toString();
                        if (name.startsWith("factuur-") && name.endsWith(".html")) {
                            relevantChange = true;
                            break;
                        }
                    }
                }
                boolean valid = key.reset();
                if (relevantChange) {
                    try {
                        reloadAction.run();
                    } catch (Exception e) {
                        log.warn("Template reload failed after change: {}", e.getMessage(), e);
                    }
                }
                if (!valid) {
                    log.warn("Watch key no longer valid for template directory; stopping watcher");
                    break;
                }
            }
        } finally {
            closeWatcher();
        }
    }

    @Override
    public void stop() {
        running.set(false);
        closeWatcher();
        if (watcherThread != null) {
            watcherThread.interrupt();
        }
    }

    @Override
    public void stop(Runnable callback) {
        stop();
        callback.run();
    }

    @Override
    public boolean isRunning() {
        return running.get();
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    @Override
    public int getPhase() {
        return 0;
    }

    private void closeWatcher() {
        if (watchService != null) {
            try {
                watchService.close();
            } catch (IOException ignored) {
            }
        }
    }
}
