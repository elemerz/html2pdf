package nl.infomedics.engine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@SpringBootApplication
@EnableScheduling
public class InvoiceEngineApplication {

    public static void main(String[] args) {
        // Silence OpenHTMLToPDF's JUL logging before it installs its own console handler
        System.setProperty("xr.util-logging.loggingEnabled", "false");
        
        log.info("Starting Invoice Engine - High Performance Monolith");
        log.info("Java Version: {}", System.getProperty("java.version"));
        log.info("Available Processors: {}", Runtime.getRuntime().availableProcessors());
        log.info("Max Memory: {} MB", Runtime.getRuntime().maxMemory() / 1024 / 1024);
        
        SpringApplication.run(InvoiceEngineApplication.class, args);
        
        log.info("Invoice Engine started successfully");
    }
}
