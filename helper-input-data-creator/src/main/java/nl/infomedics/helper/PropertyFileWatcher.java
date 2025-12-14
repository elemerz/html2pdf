package nl.infomedics.helper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.*;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Component
@RequiredArgsConstructor
public class PropertyFileWatcher {

    private final ConfigurableApplicationContext context;
    private final DataGeneratorConfig config;
    private WatchService watchService;
    private ExecutorService executorService;
    private volatile boolean running = true;

    @PostConstruct
    public void init() {
        try {
            Path propertiesPath = Paths.get("application.properties").toAbsolutePath();
            if (!Files.exists(propertiesPath)) {
                propertiesPath = Paths.get("src/main/resources/application.properties").toAbsolutePath();
            }
            
            if (!Files.exists(propertiesPath)) {
                log.warn("application.properties file not found, auto-reload disabled");
                return;
            }

            Path directory = propertiesPath.getParent();
            watchService = FileSystems.getDefault().newWatchService();
            directory.register(watchService, StandardWatchEventKinds.ENTRY_MODIFY);

            executorService = Executors.newSingleThreadExecutor();
            Path finalPropertiesPath = propertiesPath;
            executorService.submit(() -> watchForChanges(finalPropertiesPath));

            log.info("Property auto-reload enabled - watching: {}", propertiesPath);
        } catch (IOException e) {
            log.error("Failed to initialize property file watcher", e);
        }
    }

    private void watchForChanges(Path propertiesPath) {
        String fileName = propertiesPath.getFileName().toString();
        
        while (running) {
            try {
                WatchKey key = watchService.take();
                
                for (WatchEvent<?> event : key.pollEvents()) {
                    if (event.kind() == StandardWatchEventKinds.ENTRY_MODIFY) {
                        Path changed = (Path) event.context();
                        if (changed.toString().equals(fileName)) {
                            Thread.sleep(100); // Give file system time to complete write
                            reloadProperties(propertiesPath);
                        }
                    }
                }
                
                key.reset();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.error("Error watching property file", e);
            }
        }
    }

    private void reloadProperties(Path propertiesPath) {
        try {
            Properties properties = new Properties();
            try (FileInputStream fis = new FileInputStream(propertiesPath.toFile())) {
                properties.load(fis);
            }

            ConfigurableEnvironment environment = context.getEnvironment();
            PropertiesPropertySource propertySource = new PropertiesPropertySource("reloaded", properties);
            environment.getPropertySources().addFirst(propertySource);

            // Rebind the configuration
            Binder binder = Binder.get(environment);
            binder.bind("data-generator", DataGeneratorConfig.class).ifBound(newConfig -> {
                config.setOutputFolder(newConfig.getOutputFolder());
                config.setBatchMinCount(newConfig.getBatchMinCount());
                config.setBatchMaxCount(newConfig.getBatchMaxCount());
                config.setInvoiceMinCount(newConfig.getInvoiceMinCount());
                config.setInvoiceMaxCount(newConfig.getInvoiceMaxCount());
                config.setDelayMinMs(newConfig.getDelayMinMs());
                config.setDelayMaxMs(newConfig.getDelayMaxMs());
                config.setInterFileDelayMinMs(newConfig.getInterFileDelayMinMs());
                config.setInterFileDelayMaxMs(newConfig.getInterFileDelayMaxMs());
                config.setMarkerDelayMs(newConfig.getMarkerDelayMs());
                config.setModelType(newConfig.getModelType());
                config.setContinuousMode(newConfig.isContinuousMode());
                config.setInvoiceTypes(newConfig.getInvoiceTypes());
            });

            log.info(">>> Properties reloaded successfully <<<");
            log.info("Current config - Batch: {}-{}, Invoices: {}-{}, Batch-Delay: {}-{}ms, Inter-File-Delay: {}-{}ms, Output: {}", 
                     config.getBatchMinCount(), config.getBatchMaxCount(),
                     config.getInvoiceMinCount(), config.getInvoiceMaxCount(),
                     config.getDelayMinMs(), config.getDelayMaxMs(),
                     config.getInterFileDelayMinMs(), config.getInterFileDelayMaxMs(),
                     config.getOutputFolder());

        } catch (Exception e) {
            log.error("Failed to reload properties", e);
        }
    }

    @PreDestroy
    public void cleanup() {
        running = false;
        if (watchService != null) {
            try {
                watchService.close();
            } catch (IOException e) {
                log.error("Error closing watch service", e);
            }
        }
        if (executorService != null) {
            executorService.shutdownNow();
        }
    }
}
