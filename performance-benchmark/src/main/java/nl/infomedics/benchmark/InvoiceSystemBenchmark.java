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
// Role: Defines what the benchmark measures (e.g. operations per unit of time).
// Other supported values: AverageTime, SampleTime, SingleShotTime, All
@BenchmarkMode(value = Mode.Throughput)
// Role: Defines the time unit for the benchmark results.
// Other supported values: NANOSECONDS, MICROSECONDS, MILLISECONDS, MINUTES, HOURS, DAYS
@OutputTimeUnit(value = TimeUnit.SECONDS)
// Role: Configures the warmup phase to allow JIT optimization.
// Parameters: iterations (count), time (duration), timeUnit (unit), batchSize (ops per invocation)
@Warmup(iterations = 5, time = 1, timeUnit = TimeUnit.SECONDS, batchSize = 1)
// Role: Configures the measurement phase.
// Parameters: iterations (count), time (duration), timeUnit (unit), batchSize (ops per invocation)
@Measurement(iterations = 5, time = 1, timeUnit = TimeUnit.SECONDS, batchSize = 1)
// Role: Controls JVM forking for isolation.
// Parameters: value (forks), warmups (ignored forks), jvmArgs/Prepend/Append (JVM flags)
@Fork(value = 1, warmups = 0, jvmArgs = {}, jvmArgsPrepend = {}, jvmArgsAppend = {})
// Role: Sets the number of threads.
// Other supported values: Threads.MAX
@Threads(value = 1)
public class InvoiceSystemBenchmark {

    private ConfigurableApplicationContext context;
    private ZipIngestService zipIngestService;
    private Path tempDir;
    private Path sourceZip;
    private Path targetZip;
    private int expectedPdfCount;

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
        expectedPdfCount = DataGenerator.generateClassicZip(sourceZip);
    }

    @Setup(Level.Invocation)
    public void setupInvocation() throws IOException {
        // Clean pdf output to keep directory listing fast
        try (java.util.stream.Stream<Path> files = Files.list(tempDir.resolve("pdf"))) {
            files.forEach(p -> {
                try { Files.delete(p); } catch (IOException e) {}
            });
        }

        // Prepare the file for this iteration.
        // This method's time is NOT included in the benchmark score.
        String fileName = "bench-" + System.nanoTime() + ".zip";
        targetZip = tempDir.resolve("input").resolve(fileName);
        Files.copy(sourceZip, targetZip, StandardCopyOption.REPLACE_EXISTING);
    }

    private void checkPdfCreatorHealth() {
        int retries = 30;
        while (retries > 0) {
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
                return;
            } catch (Exception e) {
                System.out.println("Waiting for PDF Creator... (" + e.getMessage() + ")");
                try { Thread.sleep(1000); } catch (InterruptedException ie) {}
                retries--;
            }
        }
        // Final attempt that throws
        throw new RuntimeException("PDF Creator not reachable after retries");
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
    public void testThroughput() throws IOException, InterruptedException {
        long startCount;
        try (java.util.stream.Stream<Path> files = Files.list(tempDir.resolve("pdf"))) {
            startCount = files.count();
        }

        // Process the pre-prepared file
        zipIngestService.processZip(targetZip);

        Path pdfDir = tempDir.resolve("pdf");
        while (true) {
            try (java.util.stream.Stream<Path> files = Files.list(pdfDir)) {
                if (files.count() >= startCount + expectedPdfCount) {
                    break;
                }
            }
            Thread.sleep(10);
        }
    }
}
