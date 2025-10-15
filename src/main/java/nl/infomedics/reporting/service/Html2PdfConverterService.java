package nl.infomedics.reporting.service;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

@Service
public class Html2PdfConverterService {

    private final QrBarcodeObjectFactory objectFactory = new QrBarcodeObjectFactory();
    private final FontRegistry fontRegistry;
    private static final int PARSE_RETRY_ATTEMPTS = 10;
    private static final long PARSE_RETRY_DELAY_MS = 150L;
    private final ExecutorService conversionExecutor = Executors.newVirtualThreadPerTaskExecutor();
    private volatile Thread watcherThread;
    private volatile boolean warmupAttempted;
    private volatile boolean initialScanScheduled;

    @Value("${input.path.html}")
    private String htmlInputPath;

    @Value("${output.path.pdf}")
    private String pdfOutputPath;

    @Value("${warmup.html:}")
    private String warmupHtml;

    @Value("${debug:false}")
    private boolean debugEnabled;

    @Value("${failed.path.pdf}")
    private String failedOutputPath;

    public Html2PdfConverterService(FontRegistry fontRegistry) {
        this.fontRegistry = fontRegistry;
    }

    public void startWatching() {
        runWarmupIfConfigured();
        scheduleExistingFiles();
        synchronized (this) {
            if (watcherThread == null || !watcherThread.isAlive()) {
                watcherThread = Thread.ofPlatform()
                        .name("html2pdf-watch")
                        .start(this::watchFolder);
            }
        }
    }

    private void scheduleExistingFiles() {
        Path inputDir = Paths.get(htmlInputPath);
        if (!Files.isDirectory(inputDir)) {
            return;
        }
        synchronized (this) {
            if (initialScanScheduled) {
                return;
            }
            initialScanScheduled = true;
        }
        try (Stream<Path> files = Files.list(inputDir)) {
            files.filter(Files::isRegularFile)
                    .filter(this::isMarkerFile)
                    .forEach(file -> conversionExecutor.submit(() -> processMarker(file)));
        } catch (IOException e) {
            System.err.println("Unable to process existing HTML files in " + inputDir + ": " + e.getMessage());
        }
    }

    private void watchFolder() {
        try (WatchService watchService = FileSystems.getDefault().newWatchService()) {
            Path inputDir = Paths.get(htmlInputPath);
            inputDir.register(watchService, StandardWatchEventKinds.ENTRY_CREATE);

            System.out.println("Watching folder: " + htmlInputPath);
            while (true) {
                WatchKey key = watchService.take();

                for (WatchEvent<?> event : key.pollEvents()) {
                    if (event.kind() == StandardWatchEventKinds.ENTRY_CREATE) {
                        Path filename = (Path) event.context();
                        if (filename == null) {
                            continue;
                        }
                        if (isMarkerFile(filename)) {
                            Path markerFile = inputDir.resolve(filename);
                            conversionExecutor.submit(() -> processMarker(markerFile));
                        }
                    }
                }
                key.reset();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void processMarker(Path markerFile) {
        Path htmlFile = null;
        try {
            if (markerFile == null || !Files.exists(markerFile)) {
                return;
            }
            htmlFile = resolveHtmlForMarker(markerFile);
            if (htmlFile == null || !Files.exists(htmlFile)) {
                System.err.println("Marker " + markerFile + " found but corresponding HTML/XHTML file is missing.");
                return;
            }
            boolean success = convertHtmlToPdf(htmlFile);
            if (success) {
                deleteIfExists(htmlFile);
                deleteIfExists(markerFile);
            } else {
                movePairToFailed(htmlFile, markerFile);
            }
        } catch (Exception ex) {
            System.err.println("Unexpected error processing marker " + markerFile + ": " + ex.getMessage());
            movePairToFailed(htmlFile, markerFile);
        }
    }

    private boolean convertHtmlToPdf(Path htmlFile) {
        long startMillis = System.currentTimeMillis();
        try {
            String baseName = stripExtension(htmlFile.getFileName().toString());
            Path pdfFile = Paths.get(pdfOutputPath, baseName + ".pdf");
            Files.createDirectories(pdfFile.getParent());

            Document document = parseDocumentWithRetry(htmlFile);
            Path intermediateHtml = null;
            if (document != null) {
                objectFactory.preprocessDocument(document);
                if (debugEnabled) {
                    intermediateHtml = writeIntermediateHtml(pdfFile, baseName, document);
                }
            }

            try (OutputStream os = Files.newOutputStream(pdfFile, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
                String baseUrl = document != null ? resolveBaseUrl(htmlFile) : null;
                renderToPdf(document, htmlFile, baseUrl, os);
            }
            System.out.println("Converted: " + htmlFile + " -> " + pdfFile);
            if (debugEnabled && intermediateHtml != null) {
                System.out.println("Intermediate HTML saved to: " + intermediateHtml);
            }
            long duration = System.currentTimeMillis() - startMillis;
            System.out.println("Conversion time: " + duration + " ms");
            return true;
        } catch (Exception e) {
            System.err.println("Error converting " + htmlFile + ": " + e.getMessage());
            return false;
        } finally {
            if (Thread.interrupted()) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private String stripExtension(String name) {
        if (name == null) {
            return null;
        }
        int idx = name.lastIndexOf('.');
        if (idx > 0) {
            return name.substring(0, idx);
        }
        return name;
    }

    private boolean isMarkerFile(Path file) {
        if (file == null) {
            return false;
        }
        String lowerName = file.getFileName().toString().toLowerCase();
        return lowerName.endsWith(".txt");
    }

    private Document parseDocumentWithRetry(Path htmlFile) {
        for (int attempt = 1; attempt <= PARSE_RETRY_ATTEMPTS; attempt++) {
            try (InputStream in = Files.newInputStream(htmlFile)) {
                return parseDocument(in);
            } catch (Exception ex) {
                if (attempt == PARSE_RETRY_ATTEMPTS) {
                    System.err.println("Unable to parse " + htmlFile + " as XHTML after "
                            + PARSE_RETRY_ATTEMPTS + " attempts: " + ex.getMessage());
                } else {
                    try {
                        Thread.sleep(PARSE_RETRY_DELAY_MS);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        return null;
    }

    private Document parseDocument(InputStream input) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.parse(input);
        document.getDocumentElement().normalize();
        return document;
    }

    private void renderToPdf(Document document, Path htmlFile, String baseUrl, OutputStream os) throws IOException {
        try {
            PdfRendererBuilder builder = configuredBuilder();
            if (document != null) {
                builder.withW3cDocument(document, baseUrl != null ? baseUrl : "about:blank");
            } else if (htmlFile != null) {
                builder.withFile(htmlFile.toFile());
            } else {
                throw new IllegalArgumentException("Document and htmlFile cannot both be null.");
            }
            builder.toStream(os);
            builder.run();
        } catch (Exception ex) {
            throw new IOException("Unable to render PDF", ex);
        }
    }

    private PdfRendererBuilder configuredBuilder() {
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.useSlowMode();
        builder.useSVGDrawer(new BatikSVGDrawer());
        builder.useObjectDrawerFactory(objectFactory);
        builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.NONE);
        fontRegistry.registerEmbeddedFonts(builder);
        return builder;
    }

    private String resolveBaseUrl(Path htmlFile) {
        if (htmlFile == null) {
            return "about:blank";
        }
        Path parent = htmlFile.getParent();
        return parent != null ? parent.toUri().toString() : htmlFile.toUri().toString();
    }

    private void runWarmupIfConfigured() {
        if (warmupAttempted) {
            return;
        }
        warmupAttempted = true;
        String warmupSource = warmupHtml == null ? "" : warmupHtml.trim();
        if (warmupSource.isEmpty()) {
            return;
        }
        try {
            Document document;
            try (InputStream in = new ByteArrayInputStream(warmupSource.getBytes(StandardCharsets.UTF_8))) {
                document = parseDocument(in);
            }
            if (document != null) {
                objectFactory.preprocessDocument(document);
            }
            long start = System.currentTimeMillis();
            try (ByteArrayOutputStream os = new ByteArrayOutputStream()) {
                if (document != null) {
                    renderToPdf(document, null, "about:blank", os);
                } else {
                    PdfRendererBuilder builder = configuredBuilder();
                    builder.withHtmlContent(warmupSource, "about:blank");
                    builder.toStream(os);
                    builder.run();
                }
            }
            long duration = System.currentTimeMillis() - start;
            System.out.println("Warm-up conversion completed in " + duration + " ms");
        } catch (Exception ex) {
            System.err.println("Warm-up conversion failed: " + ex.getMessage());
        }
    }

    private Path writeIntermediateHtml(Path pdfFile, String baseName, Document document) {
        Path debugFile = pdfFile.getParent().resolve(baseName + "-intermediate.xhtml");
        try (OutputStream out = Files.newOutputStream(debugFile, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
            TransformerFactory transformerFactory = TransformerFactory.newInstance();
            Transformer transformer = transformerFactory.newTransformer();
            transformer.setOutputProperty(OutputKeys.INDENT, "yes");
            transformer.setOutputProperty(OutputKeys.METHOD, "xml");
            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            transformer.transform(new DOMSource(document), new StreamResult(out));
        } catch (Exception e) {
            System.err.println("Unable to write intermediate HTML: " + e.getMessage());
        }
        return debugFile;
    }

    private Path resolveHtmlForMarker(Path markerFile) {
        if (markerFile == null) {
            return null;
        }
        String baseName = stripExtension(markerFile.getFileName().toString());
        if (baseName == null) {
            return null;
        }
        Path directory = markerFile.getParent();
        if (directory == null) {
            directory = markerFile.toAbsolutePath().getParent();
        }
        if (directory == null) {
            return null;
        }
        String[] extensions = {".xhtml", ".html"};
        for (String extension : extensions) {
            Path candidate = directory.resolve(baseName + extension);
            if (Files.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    private void deleteIfExists(Path file) {
        if (file == null) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            System.err.println("Unable to delete file " + file + ": " + e.getMessage());
        }
    }

    private void movePairToFailed(Path htmlFile, Path markerFile) {
        if (failedOutputPath == null || failedOutputPath.trim().isEmpty()) {
            System.err.println("failed.path.pdf is not configured; leaving files in place for manual review.");
            return;
        }
        Path failedDir = Paths.get(failedOutputPath);
        moveFileToDirectory(htmlFile, failedDir);
        moveFileToDirectory(markerFile, failedDir);
    }

    private void moveFileToDirectory(Path source, Path targetDir) {
        if (source == null || targetDir == null) {
            return;
        }
        try {
            if (!Files.exists(source)) {
                return;
            }
            Files.createDirectories(targetDir);
            String originalName = source.getFileName().toString();
            Path destination = targetDir.resolve(originalName);
            if (Files.exists(destination)) {
                destination = resolveUniqueDestination(targetDir, originalName);
            }
            Files.move(source, destination, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            System.err.println("Unable to move " + source + " to " + targetDir + ": " + e.getMessage());
        }
    }

    private Path resolveUniqueDestination(Path directory, String originalName) throws IOException {
        String base = stripExtension(originalName);
        String extension = "";
        int idx = originalName.lastIndexOf('.');
        if (idx >= 0) {
            extension = originalName.substring(idx);
        }
        int attempt = 1;
        Path candidate;
        do {
            candidate = directory.resolve(base + "-" + System.currentTimeMillis() + "-" + attempt + extension);
            attempt++;
        } while (Files.exists(candidate));
        return candidate;
    }
}
