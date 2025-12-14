package nl.infomedics.invoicing.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import nl.infomedics.invoicing.config.AppProperties;
import nl.infomedics.invoicing.metrics.DiagnosticsRecorder;
import nl.infomedics.invoicing.model.BatchConversionItem;
import nl.infomedics.invoicing.model.DebiteurWithPractitioner;
import nl.infomedics.invoicing.model.MetaInfo;
import nl.infomedics.invoicing.model.Practitioner;

@Getter @Setter @Slf4j
@Service
public class ZipIngestService {
    private final ParseService parseService;
    private final JsonAssembler jsonAssembler;
    private final AppProperties appProperties;

    private final Path jsonOutputDirectory;
    private final Path pdfOutputDirectory;
    private final boolean isJsonPrettyPrint;
    private final boolean saveJsonToFolder;
    private final Xhtml2PdfClient pdfClient;
    private final ThreadPoolExecutor pdfConversionExecutor;
    private final Semaphore pdfConversionPermits;
    private final int maxConcurrentPdfConversions;
    private final Map<Integer,String> templateHtmlMap;
    private final DiagnosticsRecorder diagnostics;
    
    // Guard against concurrent processing of the same zip name in this JVM
    private static final java.util.Set<String> ACTIVE_FILES = java.util.concurrent.ConcurrentHashMap.newKeySet();

    public ZipIngestService(ParseService parseService, JsonAssembler jsonAssembler, AppProperties appProperties, Xhtml2PdfClient pdfClient, Map<Integer,String> templateHtmlMap,
            @Value("${json.output.folder}") String jsonOutputPath, @Value("${json.pretty:false}") boolean isJsonPrettyPrint,
            @Value("${json.output.folder.saveto:false}") boolean saveJsonToFolder,
            @Value("${pdf.output.folder:C:/invoice-data/_pdf}") String pdfOutputPath,
            @Value("${pdf.max-concurrent-conversions:64}") int maxConcurrentPdfConversions,
            DiagnosticsRecorder diagnostics)
            throws IOException {
        this.parseService = parseService;
        this.jsonAssembler = jsonAssembler;
        this.appProperties = appProperties;
        this.pdfClient = pdfClient;
        this.jsonOutputDirectory = Paths.get(jsonOutputPath);
        this.pdfOutputDirectory = Paths.get(pdfOutputPath);
        this.isJsonPrettyPrint = isJsonPrettyPrint;
        this.saveJsonToFolder = saveJsonToFolder;
        this.maxConcurrentPdfConversions = Math.max(1, maxConcurrentPdfConversions);
        this.pdfConversionPermits = new Semaphore(this.maxConcurrentPdfConversions);
        this.templateHtmlMap = templateHtmlMap;
        this.diagnostics = diagnostics;
        
        // Create thread pool for PDF conversions with bounded queue
        int queueCapacity = this.maxConcurrentPdfConversions * 4;
        this.pdfConversionExecutor = new ThreadPoolExecutor(
                this.maxConcurrentPdfConversions,
                this.maxConcurrentPdfConversions,
                60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(queueCapacity),
                r -> {
                    Thread thread = new Thread(r);
                    thread.setName("pdf-conversion-worker-" + thread.threadId());
                    thread.setDaemon(false);
                    return thread;
                },
                new ThreadPoolExecutor.CallerRunsPolicy()
        );
        
        Files.createDirectories(this.jsonOutputDirectory);
        Files.createDirectories(this.pdfOutputDirectory);
        log.info("ZipIngestService initialized with max {} concurrent PDF conversions, queue capacity: {}, save JSON: {}", 
                this.maxConcurrentPdfConversions, queueCapacity, this.saveJsonToFolder);
    }

    @PreDestroy
    public void shutdown() {
        log.info("Shutting down ZipIngestService...");
        pdfConversionExecutor.shutdown();
        try {
            if (!pdfConversionExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                log.warn("Forcing shutdown of PDF conversion executor...");
                pdfConversionExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            pdfConversionExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
        log.info("ZipIngestService shutdown complete");
    }

    private boolean attemptMoveWithRetry(Path source, Path target, int attempts, long sleepMs) {
        for (int i = 0; i < attempts; i++) {
            try {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
                return true;
            } catch (IOException ex) {
                if (i == attempts - 1) {
                    return false;
                }
                try { Thread.sleep(sleepMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); return false; }
            }
        }
        return false;
    }

    /**
     * Processes a ZIP file containing invoice data.
     * 
     * @param zipPath The path to the ZIP file to process.
     */
    public void processZip(Path zipPath) {
        String zipFileName = zipPath.getFileName().toString();
        
        if (!startProcessing(zipFileName)) {
            return;
        }

        String currentStage = "open zip";
        long overallStart = System.nanoTime();
        try {
            log.info("Processing {}", zipFileName);
            if (!Files.exists(zipPath)) {
                log.warn("Zip {} no longer exists, treat as already processed", zipFileName);
                return;
            }

            try (ZipFile zipFile = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
                currentStage = "parse content";
                ZipContent content;
                try (var timer = diagnostics.start("parser.zip.stage", Map.of("stage", "parse", "zip", zipFileName))) {
                    content = parseZipContent(zipFile, zipFileName);
                }
                
                currentStage = "assemble json";
                try (var timer = diagnostics.start("parser.zip.stage", Map.of("stage", "assemble-json", "zip", zipFileName))) {
                    var invoiceBundle = jsonAssembler.assemble(content.metaInfo, content.practitioner, content.debiteuren, content.specificaties);
                    currentStage = "write json";
                    try (var writeTimer = diagnostics.start("parser.zip.stage", Map.of("stage", "write-json", "zip", zipFileName))) {
                        writeJsonOutput(zipFileName, invoiceBundle);
                    }

                    currentStage = "generate pdfs";
                    triggerPdfGeneration(zipFileName, content.metaInfo, content.practitioner, invoiceBundle.getDebiteuren());
                }
                
                log.info("Processed {} ({} debiteuren, {} specificaties)", 
                        zipFileName, content.debiteuren.size(), content.specificaties.size());
            } catch (Exception ex) {
                handleProcessingFailure(zipPath, zipFileName, currentStage, ex);
                return;
            }

            archiveProcessedZip(zipPath, zipFileName);

        } finally {
            if (diagnostics.isEnabled()) {
                long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - overallStart);
                log.info("METRIC parser.zip.total zip={} ms={}", zipFileName, elapsedMs);
            }
            finishProcessing(zipFileName);
        }
    }

    private boolean startProcessing(String fileName) {
        if (!ACTIVE_FILES.add(fileName)) {
            log.warn("Duplicate processing detected, skipping {}", fileName);
            return false;
        }
        return true;
    }

    private void finishProcessing(String fileName) {
        ACTIVE_FILES.remove(fileName);
    }

    private static class ZipContent {
        MetaInfo metaInfo;
        Map<String, nl.infomedics.invoicing.model.Debiteur> debiteuren;
        Map<String, java.util.List<nl.infomedics.invoicing.model.Specificatie>> specificaties;
        nl.infomedics.invoicing.model.Practitioner practitioner;
    }

    private ZipContent parseZipContent(ZipFile zipFile, String zipFileName) throws IOException {
        ZipEntry metaEntry = findEntry(zipFile, e -> e.getName().endsWith("_Meta.txt"));
        ZipEntry debiteurenEntry = findEntry(zipFile, e -> e.getName().endsWith("_Debiteuren.txt"));
        ZipEntry specificatiesEntry = findEntry(zipFile, e -> e.getName().endsWith("_Specificaties.txt"));
        ZipEntry notasEntry = findEntry(zipFile, e -> e.getName().endsWith("_Notas.xml"));

        if (metaEntry == null) throw new IllegalStateException("Missing meta entry in " + zipFileName);
        
        boolean isXmlType = notasEntry != null;
        if (!isXmlType && (debiteurenEntry == null || specificatiesEntry == null))
            throw new IllegalStateException("Missing expected classic entries in " + zipFileName);

        ZipContent content = new ZipContent();
        content.metaInfo = parseWithReader(zipFile, metaEntry, parseService::parseMeta);

        if (isXmlType) {
            var notasResult = parseWithReader(zipFile, notasEntry, reader -> parseService.parseNotas(reader));
            content.debiteuren = notasResult.debiteuren;
            content.specificaties = notasResult.specificaties;
            content.practitioner = notasResult.practitioner;
        } else {
            content.debiteuren = parseWithReader(zipFile, debiteurenEntry, parseService::parseDebiteuren);
            content.specificaties = parseWithReader(zipFile, specificatiesEntry, parseService::parseSpecificaties);
            content.practitioner = parseService.getPractitioner();
        }
        return content;
    }

    private void writeJsonOutput(String zipFileName, nl.infomedics.invoicing.model.InvoiceBundle bundle) throws IOException {
        if (!saveJsonToFolder) {
            return;
        }
        String jsonString = jsonAssembler.stringify(bundle, isJsonPrettyPrint);
        Path outputPath = jsonOutputDirectory.resolve(stripZipExtension(zipFileName) + ".json");
        Files.writeString(outputPath, jsonString, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
    }

    private void triggerPdfGeneration(String zipFileName, MetaInfo metaInfo, Practitioner practitioner, List<DebiteurWithPractitioner> debiteuren) {
        Integer invoiceType = metaInfo != null ? metaInfo.getInvoiceType() : null;
        if (invoiceType != null && debiteuren != null && !debiteuren.isEmpty()) {
            generatePdfsPerDebtor(zipFileName, invoiceType, metaInfo, practitioner, debiteuren);
        } else {
            log.warn("PDF generation skipped for {}: invoiceType={}, debtorCount={}", 
                zipFileName, invoiceType, debiteuren != null ? debiteuren.size() : 0);
        }
    }

    private void handleProcessingFailure(Path zipPath, String zipFileName, String stage, Exception ex) {
        log.error("FAIL {} during {}: {}", zipFileName, stage, ex.getMessage(), ex);
        moveToErrorFolder(zipPath, zipFileName);
    }

    private void archiveProcessedZip(Path zipPath, String zipFileName) {
        String stage = "archive zip";
        try {
            Path archivePath = Paths.get(appProperties.getArchiveFolder()).resolve(zipFileName);
            if (attemptMoveWithRetry(zipPath, archivePath, 10, 250)) {
                log.info("Archived {} -> {}", zipFileName, archivePath.getFileName());
            } else {
                log.error("FAIL {} during {} after retries: still locked", zipFileName, stage);
                // If archiving fails (file locked?), move to error folder as fallback
                moveToErrorFolder(zipPath, zipFileName);
            }
        } catch (Exception ex) {
            log.error("FAIL {} during {}: {}", zipFileName, stage, ex.getMessage(), ex);
            moveToErrorFolder(zipPath, zipFileName);
        }
    }

    private void moveToErrorFolder(Path zipPath, String zipFileName) {
        try {
            Path errorPath = Paths.get(appProperties.getErrorFolder()).resolve(zipPath.getFileName());
            // Try with retry as well, just in case
            if (!attemptMoveWithRetry(zipPath, errorPath, 5, 500)) {
                log.error("Failed to move {} to error folder after retries", zipFileName);
            } else {
                log.warn("Moved {} to error folder", zipFileName);
            }
        } catch (Exception moveEx) {
            log.error("Failed to move {} to error folder: {}", zipFileName, moveEx.getMessage(), moveEx);
        }
    }

    private static ZipEntry findEntry(ZipFile zipFile, java.util.function.Predicate<ZipEntry> predicate) {
        Enumeration<? extends ZipEntry> entries = zipFile.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            if (!entry.isDirectory() && predicate.test(entry))
                return entry;
        }
        return null;
    }

    private static Reader createReader(ZipFile zipFile, ZipEntry entry) throws IOException {
        return new BufferedReader(new InputStreamReader(zipFile.getInputStream(entry), StandardCharsets.UTF_8));
    }

    private <T> T parseWithReader(ZipFile zipFile, ZipEntry entry, IOFunction<Reader, T> parser) throws IOException {
        try (Reader reader = createReader(zipFile, entry)) {
            return parser.apply(reader);
        }
    }

    private void generatePdfsPerDebtor(String zipFileName, Integer invoiceType, MetaInfo metaInfo, Practitioner practitioner, List<DebiteurWithPractitioner> debiteuren) {
        String stage = "load template";
        try {
            String templateHtml = loadTemplateHtml(invoiceType);
            log.debug("Template type {} size {} bytes debtors {}", invoiceType, templateHtml.length(), debiteuren.size());
            
            stage = "prepare batch items";
            List<BatchConversionItem> batchItems = new ArrayList<>();
            for (DebiteurWithPractitioner dwp : debiteuren) {
                try {
                    // Pass object directly, avoiding double serialization
                    nl.infomedics.invoicing.model.SingleDebtorInvoice singleDebtorInvoice = new nl.infomedics.invoicing.model.SingleDebtorInvoice(dwp);
                    String outputId = sanitizeFilename(dwp.getDebiteur().getInvoiceNumber() != null ? 
                        dwp.getDebiteur().getInvoiceNumber() : dwp.getDebiteur().getInsuredId());
                    batchItems.add(new BatchConversionItem(singleDebtorInvoice, outputId));
                } catch (Exception e) {
                    log.error("Failed to prepare batch item for debtor {} in {}: {}", 
                        dwp.getDebiteur().getInvoiceNumber(), zipFileName, e.getMessage(), e);
                }
            }
            
            if (batchItems.isEmpty()) {
                log.warn("No batch items prepared for {}", zipFileName);
                return;
            }
            
            stage = "submit batch conversion";
            submitBatchPdfConversion(zipFileName, batchItems, templateHtml, invoiceType);
            
        } catch (Exception ex) {
            log.error("PDF generation FAILED for {} at stage '{}': {}", zipFileName, stage, ex.getMessage(), ex);
        }
    }

    private void submitBatchPdfConversion(String zipFileName, List<BatchConversionItem> batchItems, String templateHtml, Integer invoiceType) {
        try {
            pdfConversionExecutor.submit(() -> {
                boolean permitAcquired = false;
                long waitStart = System.nanoTime();
                try {
                    permitAcquired = pdfConversionPermits.tryAcquire(30, TimeUnit.SECONDS);
                    if (!permitAcquired) {
                        log.error("Unable to acquire PDF conversion permit for {} after 30 seconds", zipFileName);
                        logPdfExecutorState();
                        return;
                    }
                    long waitMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - waitStart);
                    if (diagnostics.isEnabled()) {
                        log.info("METRIC parser.pdf.wait zip={} ms={} items={}", zipFileName, waitMs, batchItems.size());
                    }
                    convertBatchPdfs(zipFileName, new TemplateBatch(templateHtml, batchItems), invoiceType);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    log.error("Interrupted while converting PDFs for {}", zipFileName);
                } catch (Exception e) {
                    log.error("Unexpected error during batch PDF conversion for {}: {}", zipFileName, e.getMessage(), e);
                } finally {
                    if (permitAcquired) {
                        pdfConversionPermits.release();
                    }
                }
            });
        } catch (RejectedExecutionException e) {
            log.error("PDF conversion executor rejected batch task for {} (queue full or shutdown)", zipFileName);
            logPdfExecutorState();
        }
    }

    private void convertBatchPdfs(String zipFileName, TemplateBatch batch, Integer invoiceType) {
        try {
            log.debug("Converting {} PDFs for {}", batch.items().size(), zipFileName);
            Map<String, byte[]> results;
            try (var timer = diagnostics.start("parser.pdf.convert", Map.of(
                    "zip", zipFileName,
                    "invoiceType", invoiceType != null ? invoiceType.toString() : "unknown",
                    "items", Integer.toString(batch.items().size())
            ))) {
                results = pdfClient.convertBatch(batch.html(), false, batch.items());
            }
            
            String baseFileName = stripZipExtension(zipFileName);
            int successCount = 0;
            for (Map.Entry<String, byte[]> entry : results.entrySet()) {
                try {
                    Path pdfOutputPath = pdfOutputDirectory.resolve(baseFileName + "_" + entry.getKey() + ".pdf");
                    Files.write(pdfOutputPath, entry.getValue(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                    successCount++;
                } catch (Exception e) {
                    log.error("Failed to write PDF for debtor {} in {}: {}", entry.getKey(), zipFileName, e.getMessage(), e);
                }
            }
            log.debug("Wrote {}/{} PDFs for {}", successCount, batch.items().size(), zipFileName);
            
        } catch (Xhtml2PdfClient.ConversionException e) {
            log.error("Batch PDF conversion FAILED for {}: {}", zipFileName, e.getMessage(), e);
        }
    }

    private String sanitizeFilename(String name) {
        if (name == null || name.isEmpty()) return "unknown";
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private void logPdfExecutorState() {
        int availablePermits = pdfConversionPermits.availablePermits();
        int queuedTasks = pdfConversionExecutor.getQueue().size();
        int activeThreads = pdfConversionExecutor.getActiveCount();
        long completedTasks = pdfConversionExecutor.getCompletedTaskCount();
        
        log.error("PDF EXECUTOR STATE:");
        log.error("  Available permits: {}/{}", availablePermits, maxConcurrentPdfConversions);
        log.error("  Active threads: {}/{}", activeThreads, maxConcurrentPdfConversions);
        log.error("  Queued tasks: {}", queuedTasks);
        log.error("  Completed tasks: {}", completedTasks);
    }

    @FunctionalInterface
    private interface IOFunction<I, O> {
        O apply(I input) throws IOException;
    }

    private static String stripZipExtension(String fileName) {
        return fileName.endsWith(".zip") ? fileName.substring(0, fileName.length() - 4) : fileName;
    }

    private String loadTemplateHtml(Integer invoiceType) {
        String html = templateHtmlMap.get(invoiceType);
        if (html == null) throw new IllegalStateException("Missing template HTML for invoiceType=" + invoiceType);
        return html;
    }
}
