package nl.infomedics.benchmark;

import org.openjdk.jmh.annotations.*;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import nl.infomedics.invoicing.InvoiceParserApplication;
import nl.infomedics.invoicing.service.ZipIngestService;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.TimeUnit;

@State(Scope.Benchmark)
@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.SECONDS)
public class InvoiceSystemBenchmark {

    private ConfigurableApplicationContext context;
    private ZipIngestService zipIngestService;
    private Path tempDir;
    private Path sourceZip;

    @Param({"classic"})
    private String modelType;

    @Param({"16"})
    private int zipConcurrentWorkers;

    @Param({"16"})
    private int pdfMaxConcurrentConversions;

    @Setup(Level.Trial)
    public void setup() throws IOException {
        // Set system properties to tune the application
        System.setProperty("zip.concurrent-workers", String.valueOf(zipConcurrentWorkers));
        System.setProperty("pdf.max-concurrent-conversions", String.valueOf(pdfMaxConcurrentConversions));
        
        // Use a separate folder for benchmark to avoid interference with FileWatchRunner
        tempDir = Files.createTempDirectory("jmh-invoice-bench");
        System.setProperty("zip.input-folder", tempDir.resolve("input").toString());
        System.setProperty("zip.archive-folder", tempDir.resolve("archive").toString());
        System.setProperty("zip.error-folder", tempDir.resolve("error").toString());
        System.setProperty("json.output.folder", tempDir.resolve("json").toString());
        System.setProperty("pdf.output.folder", tempDir.resolve("pdf").toString());
        
        // Avoid port conflict with running services
        System.setProperty("server.port", "0");
        // Ensure we point to the local PDF creator
        System.setProperty("xhtml2pdf.base-url", "http://localhost:6969");
        
        // Use templates from the sibling module to avoid duplication
        // CWD is expected to be the performance-benchmark module folder
        System.setProperty("templates.for-pdf.path", "../invoice-parser/for-pdf");
        
        Files.createDirectories(tempDir.resolve("input"));
        Files.createDirectories(tempDir.resolve("archive"));
        Files.createDirectories(tempDir.resolve("error"));

        // Start Spring Boot application
        context = SpringApplication.run(InvoiceParserApplication.class);
        zipIngestService = context.getBean(ZipIngestService.class);
        
        // Verify PDF Creator connectivity
        checkPdfCreatorHealth();
        
        // Create a valid zip file using DataGenerator
        sourceZip = tempDir.resolve("source.zip");
        DataGenerator.generateClassicZip(sourceZip);
    }

    private void checkPdfCreatorHealth() {
        try {
            java.net.URL url = new java.net.URL("http://localhost:6969");
            java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2000);
            conn.connect();
            // We just want to check if the port is open and accepting connections
            // Even a 404 is fine, it means the server is there.
            // ConnectException would be thrown if not listening.
            conn.disconnect();
            System.out.println("PDF Creator is reachable at http://localhost:6969");
        } catch (Exception e) {
            System.err.println("WARNING: PDF Creator is NOT reachable at http://localhost:6969. Benchmark will likely fail.");
            System.err.println("Please ensure pdf-creator is running (use start.bat). Error: " + e.getMessage());
            // We don't throw exception here to allow the benchmark to attempt anyway, 
            // but in a real scenario we might want to fail fast.
            throw new RuntimeException("PDF Creator not reachable", e);
        }
    }

    @TearDown(Level.Trial)
    public void tearDown() throws IOException {
        if (context != null) {
            context.close();
        }
        // Cleanup temp dir
        // Files.walk(tempDir)... (omitted for brevity)
    }

    @Benchmark
    public void testThroughput() throws IOException {
        // Copy source zip to input folder with a unique name
        String fileName = "bench-" + System.nanoTime() + ".zip";
        Path target = tempDir.resolve("input").resolve(fileName);
        Files.copy(sourceZip, target, StandardCopyOption.REPLACE_EXISTING);
        
        // Process
        zipIngestService.processZip(target);
    }
}
