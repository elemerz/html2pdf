package nl.infomedics.engine.core;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import lombok.extern.slf4j.Slf4j;
import nl.infomedics.engine.config.EngineProperties;
import nl.infomedics.engine.creator.PdfConverterService;
import nl.infomedics.engine.metrics.DiagnosticsRecorder;
import nl.infomedics.engine.parser.JsonAssembler;
import nl.infomedics.engine.parser.ParseService;
import nl.infomedics.invoicing.model.*;

@Slf4j
@Service
public class InvoiceProcessor {

    private final ParseService parseService;
    private final JsonAssembler jsonAssembler;
    private final PdfConverterService pdfConverter;
    private final TemplateManager templateManager;
    private final PlaceholderResolver placeholderResolver;
    private final EngineProperties properties;
    private final DiagnosticsRecorder diagnostics;
    private final ExecutorService cpuExecutor;
    private final ObjectMapper objectMapper;

    public InvoiceProcessor(ParseService parseService,
                           JsonAssembler jsonAssembler,
                           PdfConverterService pdfConverter,
                           TemplateManager templateManager,
                           PlaceholderResolver placeholderResolver,
                           EngineProperties properties,
                           DiagnosticsRecorder diagnostics,
                           ExecutorService cpuExecutor) {
        this.parseService = parseService;
        this.jsonAssembler = jsonAssembler;
        this.pdfConverter = pdfConverter;
        this.templateManager = templateManager;
        this.placeholderResolver = placeholderResolver;
        this.properties = properties;
        this.diagnostics = diagnostics;
        this.cpuExecutor = cpuExecutor;
        this.objectMapper = new ObjectMapper()
                .registerModule(new JavaTimeModule());
    }

    public void processZipFile(Path zipPath) {
        long startTime = System.currentTimeMillis();
        String zipName = zipPath.getFileName().toString();
        
        log.info("Processing zip: {}", zipName);

        try (var zipTimer = diagnostics.start("engine.process.total",
                Map.of("zip", zipName))) {

            ParsedZipContent content;
            try (var extractTimer = diagnostics.start("engine.process.extract", Map.of())) {
                content = extractAndParseZipData(zipPath);
            }

            Practitioner practitioner = parseService.getPractitioner();

            int invoiceCount = content.debiteurs.size();
            log.info("Parsed {} invoices from {}", invoiceCount, zipName);

            String templateHtml = templateManager.getTemplate(content.metaInfo.getInvoiceType());
            if (templateHtml == null || templateHtml.isBlank()) {
                throw new ProcessingException("No template found for invoice type: " + content.metaInfo.getInvoiceType());
            }

            List<SingleDebtorInvoice> invoices = createInvoices(content.metaInfo, practitioner, content.debiteurs, content.specifications);

            try (var batchTimer = diagnostics.start("engine.process.pdf-batch",
                    Map.of("count", String.valueOf(invoiceCount)))) {
                String zipBaseName = stripZipExtension(zipName);
                generatePdfsParallel(zipBaseName, invoices, templateHtml);
            }

            if (properties.getOutput().isSaveJson()) {
                String zipBaseName = stripZipExtension(zipName);
                saveJsonFiles(zipBaseName, invoices);
            }

            Path archivePath = Paths.get(properties.getInput().getArchiveFolder())
                    .resolve(zipPath.getFileName());
            Files.move(zipPath, archivePath, StandardCopyOption.REPLACE_EXISTING);

            long duration = System.currentTimeMillis() - startTime;
            log.info("Completed {} in {} ms ({} invoices)", 
                    zipName, duration, invoiceCount);

        } catch (Exception e) {
            log.error("Failed to process {}", zipName, e);
            moveToError(zipPath);
        }
    }

    private ParsedZipContent extractAndParseZipData(Path zipPath) throws IOException {
        try (ZipFile zipFile = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
            ZipEntry metaEntry = findEntry(zipFile, "_Meta.txt");
            ZipEntry debiteurenEntry = findEntry(zipFile, "_Debiteuren.txt");
            ZipEntry specificatiesEntry = findEntry(zipFile, "_Specificaties.txt");
            ZipEntry notasEntry = findEntry(zipFile, "_Notas.xml");

            if (metaEntry == null) {
                throw new IOException("Missing _Meta.txt entry in zip");
            }

            boolean isXmlType = notasEntry != null;
            if (!isXmlType && (debiteurenEntry == null || specificatiesEntry == null)) {
                throw new IOException("Missing expected classic entries (_Debiteuren.txt or _Specificaties.txt) in zip");
            }

            ParsedZipContent content = new ParsedZipContent();
            content.metaInfo = parseWithReader(zipFile, metaEntry, parseService::parseMeta);

            if (isXmlType) {
                var notasResult = parseWithReader(zipFile, notasEntry, parseService::parseNotas);
                content.debiteurs = notasResult.debiteuren;
                content.specifications = notasResult.specificaties;
                content.practitioner = notasResult.practitioner;
            } else {
                content.debiteurs = parseWithReader(zipFile, debiteurenEntry, parseService::parseDebiteuren);
                content.specifications = parseWithReader(zipFile, specificatiesEntry, parseService::parseSpecificaties);
                content.practitioner = parseService.getPractitioner();
            }
            return content;
        }
    }

    private ZipEntry findEntry(ZipFile zipFile, String suffix) {
        Enumeration<? extends ZipEntry> entries = zipFile.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            if (!entry.isDirectory() && entry.getName().endsWith(suffix)) {
                return entry;
            }
        }
        return null;
    }

    private Reader createReader(ZipFile zipFile, ZipEntry entry) throws IOException {
        return new BufferedReader(new InputStreamReader(zipFile.getInputStream(entry), StandardCharsets.UTF_8));
    }

    private <T> T parseWithReader(ZipFile zipFile, ZipEntry entry, IOFunction<Reader, T> parser) throws IOException {
        try (Reader reader = createReader(zipFile, entry)) {
            return parser.apply(reader);
        }
    }

    private List<SingleDebtorInvoice> createInvoices(MetaInfo metaInfo,
                                                     Practitioner practitioner,
                                                     Map<String, Debiteur> debiteurs,
                                                     Map<String, List<Specificatie>> specifications) {
        List<SingleDebtorInvoice> result = new ArrayList<>(debiteurs.size());
        
        for (Debiteur debiteur : debiteurs.values()) {
            String invoiceNumber = debiteur.getInvoiceNumber();
            List<Specificatie> specs = specifications.get(invoiceNumber);
            
            SingleDebtorInvoice invoice = jsonAssembler.createSingleDebtorInvoice(
                    metaInfo, practitioner, debiteur, specs);
            result.add(invoice);
        }
        
        return result;
    }

    private static String stripZipExtension(String fileName) {
        return fileName.endsWith(".zip") ? fileName.substring(0, fileName.length() - 4) : fileName;
    }

    private void generatePdfsParallel(String zipBaseName, List<SingleDebtorInvoice> invoices, String templateHtml) {
        List<CompletableFuture<Void>> futures = invoices.stream()
                .map(invoice -> CompletableFuture.runAsync(() -> 
                        generateSinglePdf(zipBaseName, invoice, templateHtml), cpuExecutor))
                .toList();

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
    }

    private void generateSinglePdf(String zipBaseName, SingleDebtorInvoice invoice, String templateHtml) {
        try (var pdfTimer = diagnostics.start("engine.process.single-pdf", Map.of())) {
            String invoiceNumber = invoice.getDebiteur().getDebiteur().getInvoiceNumber();
            String insuredId = invoice.getDebiteur().getDebiteur().getInsuredId();
            String outputId = sanitizeFilename(invoiceNumber != null ? invoiceNumber : insuredId);

            String resolvedHtml;
            try (var resolveTimer = diagnostics.start("engine.process.resolve-placeholders", Map.of())) {
                resolvedHtml = placeholderResolver.resolve(templateHtml, invoice.getDebiteur());
            }

            byte[] pdfBytes;
            try (var convertTimer = diagnostics.start("engine.process.convert-pdf", Map.of())) {
                pdfBytes = pdfConverter.convertHtmlToPdf(resolvedHtml);
            }

            savePdf(zipBaseName, outputId, pdfBytes);

        } catch (Exception e) {
            log.error("Failed to generate PDF for invoice", e);
            throw new RuntimeException("PDF generation failed", e);
        }
    }

    private String sanitizeFilename(String name) {
        if (name == null || name.isEmpty()) return "unknown";
        return name.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    private void savePdf(String zipBaseName, String outputId, byte[] pdfBytes) throws IOException {
        Path outputPath = Paths.get(properties.getOutput().getPdfFolder())
                .resolve(zipBaseName + "_" + outputId + ".pdf");
        Files.write(outputPath, pdfBytes);
    }

    private void saveJsonFiles(String zipBaseName, List<SingleDebtorInvoice> invoices) {
        for (SingleDebtorInvoice invoice : invoices) {
            try {
                String invoiceNumber = invoice.getDebiteur().getDebiteur().getInvoiceNumber();
                String outputId = sanitizeFilename(invoiceNumber != null ? invoiceNumber : invoice.getDebiteur().getDebiteur().getInsuredId());
                String json = jsonAssembler.stringifySingleDebtor(invoice, 
                        properties.getOutput().isPrettyPrintJson());
                
                Path jsonPath = Paths.get(properties.getOutput().getJsonFolder())
                        .resolve(zipBaseName + "_" + outputId + ".json");
                Files.writeString(jsonPath, json, StandardCharsets.UTF_8);
            } catch (Exception e) {
                log.warn("Failed to save JSON file", e);
            }
        }
    }

    private void moveToError(Path zipPath) {
        try {
            Path errorPath = Paths.get(properties.getInput().getErrorFolder())
                    .resolve(zipPath.getFileName());
            Files.move(zipPath, errorPath, StandardCopyOption.REPLACE_EXISTING);
            log.info("Moved {} to error folder", zipPath.getFileName());
        } catch (IOException e) {
            log.error("Failed to move {} to error folder", zipPath, e);
        }
    }

    private static class ParsedZipContent {
        MetaInfo metaInfo;
        Map<String, Debiteur> debiteurs;
        Map<String, List<Specificatie>> specifications;
        Practitioner practitioner;
    }

    @FunctionalInterface
    private interface IOFunction<I, O> {
        O apply(I input) throws IOException;
    }

    public static class ProcessingException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        
        public ProcessingException(String message) {
            super(message);
        }
        
        public ProcessingException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
