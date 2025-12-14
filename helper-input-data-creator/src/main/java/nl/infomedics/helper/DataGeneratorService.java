package nl.infomedics.helper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataGeneratorService {

    private final DataGeneratorConfig config;
    private final ClassicDataGenerator classicDataGenerator;
    private final Random random = new Random();
    private final AtomicLong totalFilesGenerated = new AtomicLong(0);

    public void runContinuously() {
        log.info("Running in continuous mode - press Ctrl+C to stop");
        
        while (true) {
            try {
                generateBatch();
                long delay = getRandomDelay();
                log.info("Waiting {} ms before next batch...", delay);
                Thread.sleep(delay);
            } catch (InterruptedException e) {
                log.info("Interrupted, shutting down gracefully");
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.error("Error during batch generation", e);
            }
        }
        
        log.info("Total files generated: {}", totalFilesGenerated.get());
    }

    public void generateBatch() {
        int batchSize = getRandomBatchSize();
        log.info("[Batch: {}] === Generating {} file(s) ===", batchSize, batchSize);
        
        for (int i = 0; i < batchSize; i++) {
            try {
                generateSingleZipWithMarker(i + 1, batchSize);
                
                // Add inter-file delay (except after the last file)
                if (i < batchSize - 1) {
                    long interFileDelay = getRandomInterFileDelay();
                    if (interFileDelay > 0) {
                        log.debug("[Batch: {}] Waiting {} ms before next file...", batchSize, interFileDelay);
                        Thread.sleep(interFileDelay);
                    }
                }
            } catch (Exception e) {
                log.error("[Batch: {}] Failed to generate file {}/{}", batchSize, i + 1, batchSize, e);
            }
        }
        
        log.info("[Batch: {}] === Complete: {} file(s) generated ===", batchSize, batchSize);
    }

    private void generateSingleZipWithMarker(int fileNum, int batchSize) throws IOException, InterruptedException {
        ensureOutputFolderExists();
        
        String folderName = generateFolderName();
        int invoiceType = getRandomInvoiceType();
        int invoiceCount = getRandomInvoiceCount();
        
        Path outputDir = Paths.get(config.getOutputFolder());
        Path zipPath = outputDir.resolve(folderName + ".zip");
        Path markerPath = outputDir.resolve(folderName + ".txt");
        
        log.info("[Batch: {}] [{}/{}] Creating: {} (type={}, count={})", 
                 batchSize, fileNum, batchSize, zipPath.getFileName(), invoiceType, invoiceCount);
        
        classicDataGenerator.generateClassicZip(zipPath, folderName, invoiceType, invoiceCount);
        
        Thread.sleep(config.getMarkerDelayMs());
        
        Files.createFile(markerPath);
        log.info("[Batch: {}] [{}/{}] Created marker: {}", batchSize, fileNum, batchSize, markerPath.getFileName());
        
        totalFilesGenerated.incrementAndGet();
    }

    private void ensureOutputFolderExists() throws IOException {
        Path outputPath = Paths.get(config.getOutputFolder());
        if (!Files.exists(outputPath)) {
            Files.createDirectories(outputPath);
            log.info("Created output directory: {}", outputPath);
        }
    }

    private String generateFolderName() {
        String[] companies = {"InfFactoring", "CMIB", "ACC_InfFactoring", "ACC_CMIB"};
        String[] systems = {"TIM", "NOLA", "iDig"};
        
        String company = companies[random.nextInt(companies.length)];
        String system = systems[random.nextInt(systems.length)];
        String date = java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"));
        long ticks = System.currentTimeMillis() * 10000 + random.nextInt(10000);
        
        return String.format("%s_%s_%s_%d", company, system, date, ticks);
    }

    private int getRandomBatchSize() {
        return random.nextInt(config.getBatchMaxCount() - config.getBatchMinCount() + 1) + config.getBatchMinCount();
    }

    private int getRandomInvoiceCount() {
        return random.nextInt(config.getInvoiceMaxCount() - config.getInvoiceMinCount() + 1) + config.getInvoiceMinCount();
    }

    private int getRandomInvoiceType() {
        return config.getInvoiceTypes().get(random.nextInt(config.getInvoiceTypes().size()));
    }

    private long getRandomDelay() {
        return (long) (random.nextDouble() * (config.getDelayMaxMs() - config.getDelayMinMs()) + config.getDelayMinMs());
    }

    private long getRandomInterFileDelay() {
        if (config.getInterFileDelayMaxMs() == 0 && config.getInterFileDelayMinMs() == 0) {
            return 0;
        }
        return (long) (random.nextDouble() * (config.getInterFileDelayMaxMs() - config.getInterFileDelayMinMs()) + config.getInterFileDelayMinMs());
    }
}
