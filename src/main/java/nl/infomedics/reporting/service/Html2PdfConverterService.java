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
import java.nio.file.LinkOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.FileVisitResult;
import java.nio.file.SimpleFileVisitor;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

/**
 * Watches an input directory for marker files, pairs them with XHTML input, and converts the content to PDF.
 * Conversion is delegated to OpenHTMLtoPDF, and failures are quarantined for review.
 */
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

    /**
     * Creates the converter service with an injected font registry for renderer configuration.
     *
     * @param fontRegistry registry responsible for exposing embedded fonts
     */
    public Html2PdfConverterService(FontRegistry fontRegistry) {
        this.fontRegistry = fontRegistry;
    }

    private void registerAllDirectories(Path start, WatchService watchService, Map<WatchKey, Path> watchKeys) throws IOException {
        if (start == null) {
            return;
        }
        if (!Files.exists(start)) {
            try {
                Files.createDirectories(start);
            } catch (IOException ioe) {
                System.err.println("Unable to create input directory " + start + ": " + ioe.getMessage());
                return;
            }
        }
        Files.walkFileTree(start, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                registerDirectory(dir, watchService, watchKeys);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFileFailed(Path file, IOException exc) {
                System.err.println("Unable to access " + file + ": " + exc.getMessage());
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private void registerDirectory(Path dir, WatchService watchService, Map<WatchKey, Path> watchKeys) throws IOException {
        if (dir == null) {
            return;
        }
        if (watchKeys.containsValue(dir)) {
            return;
        }
        WatchKey key = dir.register(watchService, StandardWatchEventKinds.ENTRY_CREATE, StandardWatchEventKinds.ENTRY_MODIFY);
        watchKeys.put(key, dir);
    }

    private Path resolvePdfOutputPath(Path htmlFile, String baseName) {
        Path outputRoot = getOutputRoot();
        Path inputRoot = getInputRoot();
        Path htmlAbsolute = htmlFile.toAbsolutePath().normalize();
        Path relative;
        try {
            relative = inputRoot.relativize(htmlAbsolute);
        } catch (IllegalArgumentException ex) {
            relative = htmlAbsolute.getFileName();
        }

        Path relativeDir = relative != null ? relative.getParent() : null;
        Path targetDir = relativeDir != null ? outputRoot.resolve(relativeDir) : outputRoot;
        return targetDir.resolve(baseName + ".pdf");
    }

    private void submitExistingMarkers(Path directory) {
        if (directory == null) {
            return;
        }
        try (Stream<Path> files = Files.list(directory)) {
            files.filter(Files::isRegularFile)
                    .filter(this::isMarkerFile)
                    .forEach(file -> conversionExecutor.submit(() -> processMarker(file)));
        } catch (IOException e) {
            System.err.println("Unable to scan directory " + directory + " for markers: " + e.getMessage());
        }
    }

    private Path getInputRoot() {
        return Paths.get(htmlInputPath).toAbsolutePath().normalize();
    }

    private Path getOutputRoot() {
        return Paths.get(pdfOutputPath).toAbsolutePath().normalize();
    }

    /**
     * Ensures warm-up runs once, schedules any pre-existing work, and spins up the directory watcher.
     */
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

    /**
     * Submits already-present marker files for conversion when the service starts.
     */
    private void scheduleExistingFiles() {
        Path inputDir = getInputRoot();
        if (!Files.isDirectory(inputDir)) {
            return;
        }
        synchronized (this) {
            if (initialScanScheduled) {
                return;
            }
            initialScanScheduled = true;
        }
        try (Stream<Path> files = Files.walk(inputDir)) {
            files.filter(Files::isRegularFile)
                    .filter(this::isMarkerFile)
                    .forEach(file -> conversionExecutor.submit(() -> processMarker(file)));
        } catch (IOException e) {
            System.err.println("Unable to process existing HTML files in " + inputDir + ": " + e.getMessage());
        }
    }

    /**
     * Blocks on file-system events and triggers conversion when a new marker arrives.
     */
    private void watchFolder() {
        Path inputRoot = getInputRoot();
        try (WatchService watchService = FileSystems.getDefault().newWatchService()) {
            Map<WatchKey, Path> watchKeys = new HashMap<>();
            registerAllDirectories(inputRoot, watchService, watchKeys);

            System.out.println("Watching folder: " + inputRoot);
            while (true) {
                WatchKey key = watchService.take();
                Path dir = watchKeys.get(key);
                if (dir == null) {
                    key.reset();
                    continue;
                }

                for (WatchEvent<?> event : key.pollEvents()) {
                    WatchEvent.Kind<?> kind = event.kind();
                    if (kind == StandardWatchEventKinds.OVERFLOW) {
                        continue;
                    }
                    Path relative = (Path) event.context();
                    if (relative == null) {
                        continue;
                    }
                    Path child = dir.resolve(relative);
                    if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
                        if (Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) {
                            registerAllDirectories(child, watchService, watchKeys);
                            submitExistingMarkers(child);
                        } else if (isMarkerFile(child)) {
                            conversionExecutor.submit(() -> processMarker(child));
                        }
                    } else if (kind == StandardWatchEventKinds.ENTRY_MODIFY && Files.isRegularFile(child)) {
                        if (isMarkerFile(child)) {
                            conversionExecutor.submit(() -> processMarker(child));
                        }
                    }
                }

                boolean valid = key.reset();
                if (!valid) {
                    watchKeys.remove(key);
                    if (watchKeys.isEmpty()) {
                        break;
                    }
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } catch (IOException ioe) {
            System.err.println("Watcher stopped due to I/O error: " + ioe.getMessage());
        }
    }

    /**
     * Resolves the HTML counterpart for the supplied marker and attempts conversion.
     *
     * @param markerFile signal file that indicates a report is ready to convert
     */
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

    /**
     * Runs the XHTML to PDF conversion and manages debug artifacts.
     *
     * @param htmlFile XHTML/HTML file to convert
     * @return {@code true} if the PDF was produced successfully; {@code false} otherwise
     */
    private boolean convertHtmlToPdf(Path htmlFile) {
        long startMillis = System.currentTimeMillis();
        try {
            String baseName = stripExtension(htmlFile.getFileName().toString());
            if (baseName == null || baseName.isBlank()) {
                baseName = "document";
            }
            Path pdfFile = resolvePdfOutputPath(htmlFile, baseName);
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

    /**
     * Drops the trailing extension, if present.
     *
     * @param name file name
     * @return base component without extension
     */
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

    /**
     * Identifies whether the provided path refers to a marker file.
     *
     * @param file candidate path
     * @return {@code true} if the file uses a marker extension
     */
    private boolean isMarkerFile(Path file) {
        if (file == null) {
            return false;
        }
        String lowerName = file.getFileName().toString().toLowerCase();
        return lowerName.endsWith(".txt");
    }

    /**
     * Attempts to parse the document multiple times to guard against transient file-access issues.
     *
     * @param htmlFile source file
     * @return parsed DOM document or {@code null} when parsing fails
     */
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

    /**
     * Parses the supplied stream as a safe, namespace-aware DOM document.
     *
     * @param input XHTML/HTML stream
     * @return DOM representation
     * @throws Exception when the XML cannot be parsed
     */
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

    /**
     * Configures the renderer, supplying either a DOM document or backing file to produce a PDF.
     *
     * @param document parsed document (optional)
     * @param htmlFile fallback file when the DOM is unavailable
     * @param baseUrl  base URL for relative resource resolution
     * @param os       output stream receiving the PDF bytes
     * @throws IOException when rendering fails
     */
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

    /**
     * Provides a renderer builder with the application-specific options applied.
     *
     * @return configured builder instance
     */
    private PdfRendererBuilder configuredBuilder() {
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.useSlowMode();
        builder.useSVGDrawer(new BatikSVGDrawer());
        builder.useObjectDrawerFactory(objectFactory);
        builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.NONE);
        fontRegistry.registerEmbeddedFonts(builder);
        return builder;
    }

    /**
     * Resolves a base URL so relative assets within the XHTML can be located during rendering.
     *
     * @param htmlFile source file
     * @return string form of the base URL
     */
    private String resolveBaseUrl(Path htmlFile) {
        if (htmlFile == null) {
            return "about:blank";
        }
        Path parent = htmlFile.getParent();
        return parent != null ? parent.toUri().toString() : htmlFile.toUri().toString();
    }

    /**
     * Executes an optional inline warm-up render to amortize initialization costs before real work begins.
     */
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

    /**
     * Writes the transformed XHTML to disk when debug mode is enabled.
     *
     * @param pdfFile  target PDF path (used to determine sibling location)
     * @param baseName file base name
     * @param document DOM to serialise
     * @return path to the debug XHTML file
     */
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

    /**
     * Locates the HTML or XHTML file that corresponds with the provided marker.
     *
     * @param markerFile marker signalling conversion readiness
     * @return matching HTML path or {@code null} if none is found
     */
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

    /**
     * Attempts to delete the given file, logging errors instead of throwing.
     *
     * @param file candidate for deletion
     */
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

    /**
     * Moves the HTML/marker pair into the configured failure directory for manual inspection.
     *
     * @param htmlFile   HTML input that failed
     * @param markerFile marker associated with the failure
     */
    private void movePairToFailed(Path htmlFile, Path markerFile) {
        if (failedOutputPath == null || failedOutputPath.trim().isEmpty()) {
            System.err.println("failed.path.pdf is not configured; leaving files in place for manual review.");
            return;
        }
        Path failedDir = Paths.get(failedOutputPath);
        moveFileToDirectory(htmlFile, failedDir);
        moveFileToDirectory(markerFile, failedDir);
    }

    /**
     * Moves an individual file into a target directory, ensuring the directory exists first.
     *
     * @param source    file to move
     * @param targetDir destination directory
     */
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

    /**
     * Generates a unique destination name when a conflicting file already exists.
     *
     * @param directory    target directory
     * @param originalName original file name
     * @return collision-free destination path
     * @throws IOException if directory access fails
     */
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
