package nl.infomedics.benchmark;

import org.openjdk.jmh.annotations.*;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import nl.infomedics.invoicing.InvoiceParserApplication;
import nl.infomedics.invoicing.service.ZipIngestService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

@State(Scope.Benchmark)
@BenchmarkMode(Mode.SingleShotTime)
@OutputTimeUnit(TimeUnit.SECONDS)
@Warmup(iterations = 0)
@Measurement(iterations = 1)
@Fork(value = 1)
@Threads(value = 1)
public class FastInvoiceBenchmark {

    private ConfigurableApplicationContext context;
    private ZipIngestService zipIngestService;
    private Path tempDir;
    private List<Path> inputFiles;
    private int expectedPdfCount;

    @Param({"20"})
    private String invoiceTypes;

    @Param({"100"})
    private int fileCount;

    @Setup(Level.Trial)
    public void setup() throws IOException {
        // Set system properties to tune the application
        // We use defaults for workers as they are not parameterized here, 
        // but we could add them if needed. Using defaults from application.properties or defaults.
        
        // Use a separate folder for benchmark
        tempDir = Files.createTempDirectory("jmh-fast-bench");
        Path inputDir = tempDir.resolve("input");
        
        System.setProperty("zip.input-folder", inputDir.toString());
        System.setProperty("zip.archive-folder", tempDir.resolve("archive").toString());
        System.setProperty("zip.error-folder", tempDir.resolve("error").toString());
        System.setProperty("json.output.folder", tempDir.resolve("json").toString());
        System.setProperty("pdf.output.folder", tempDir.resolve("pdf").toString());
        
        // Avoid port conflict
        System.setProperty("server.port", "0");
        // Ensure we point to the local PDF creator
        System.setProperty("xhtml2pdf.base-url", "http://localhost:6969");
        
        // Use templates from the sibling module
        System.setProperty("templates.for-pdf.path", "../invoice-parser/for-pdf");
        
        Files.createDirectories(inputDir);
        Files.createDirectories(tempDir.resolve("archive"));
        Files.createDirectories(tempDir.resolve("error"));

        // Start Spring Boot application
        context = SpringApplication.run(InvoiceParserApplication.class);
        zipIngestService = context.getBean(ZipIngestService.class);
        
        // Verify PDF Creator connectivity
        checkPdfCreatorHealth();
        
        // Parse invoice types
        int[] types = Stream.of(invoiceTypes.split(","))
                            .map(String::trim)
                            .mapToInt(Integer::parseInt)
                            .toArray();

        // Warm-up: process 1 single zip file
        System.out.println("Running warm-up...");
        Path warmupFile = tempDir.resolve("warmup.zip");
        DataGenerator.generateClassicZip(warmupFile, types);
        zipIngestService.processZip(warmupFile);
        
        // Preparation phase: Generate zip files
        System.out.println("Generating " + fileCount + " zip files...");
        inputFiles = new ArrayList<>();
        expectedPdfCount = 0;
        for (int i = 0; i < fileCount; i++) {
            Path file = inputDir.resolve("bench-" + i + ".zip");
            expectedPdfCount += DataGenerator.generateClassicZip(file, types);
            inputFiles.add(file);
        }
        System.out.println("Total expected PDFs: " + expectedPdfCount);
    }

    @Benchmark
    public void processFiles() throws InterruptedException, IOException {
        for (Path file : inputFiles) {
            zipIngestService.processZip(file);
        }
        
        // Wait for all PDFs to be produced
        Path pdfDir = tempDir.resolve("pdf");
        long start = System.currentTimeMillis();
        while (true) {
            try (Stream<Path> files = Files.list(pdfDir)) {
                if (files.count() >= expectedPdfCount) {
                    break;
                }
            }
            if (System.currentTimeMillis() - start > 300000) { // 5 min timeout
                 throw new RuntimeException("Timeout waiting for PDFs. Expected: " + expectedPdfCount);
            }
            Thread.sleep(100);
        }
    }

    @TearDown(Level.Trial)
    public void tearDown() throws IOException {
        if (context != null) {
            context.close();
        }
        // Cleanup temp dir
        if (tempDir != null && Files.exists(tempDir)) {
            try (Stream<Path> walk = Files.walk(tempDir)) {
                walk.sorted(Comparator.reverseOrder())
                    .map(Path::toFile)
                    .forEach(java.io.File::delete);
            }
        }
    }

    private void checkPdfCreatorHealth() {
        int retries = 30;
        while (retries > 0) {
            try {
                java.net.URL url = new java.net.URL("http://localhost:6969");
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(2000);
                conn.connect();
                conn.disconnect();
                System.out.println("PDF Creator is reachable at http://localhost:6969");
                return;
            } catch (Exception e) {
                System.out.println("Waiting for PDF Creator... (" + e.getMessage() + ")");
                try { Thread.sleep(1000); } catch (InterruptedException ie) {}
                retries--;
            }
        }
        throw new RuntimeException("PDF Creator not reachable after retries");
    }
}
