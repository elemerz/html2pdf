package nl.infomedics.reporting.service;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
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
import java.awt.Font;
import java.awt.FontFormatException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;

@Service
public class Html2PdfConverterService {

    private final QrBarcodeObjectFactory objectFactory = new QrBarcodeObjectFactory();
    private static final int PARSE_RETRY_ATTEMPTS = 10;
    private static final long PARSE_RETRY_DELAY_MS = 150L;
    private static final String FONT_RESOURCE_DIRECTORY = "fonts";
    private static final String[] FONT_EXTENSIONS = {"ttf", "otf", "ttc", "otc"};
    private final ExecutorService conversionExecutor = Executors.newVirtualThreadPerTaskExecutor();
    private volatile Thread watcherThread;
    private volatile boolean warmupAttempted;
    private volatile boolean initialScanScheduled;
    private final Object fontLoadLock = new Object();
    private volatile Map<String, byte[]> cachedFontData;
    private final Map<String, Set<String>> loadedFontAliases = new ConcurrentHashMap<>();

    @Value("${input.path.html}")
    private String htmlInputPath;

    @Value("${output.path.pdf}")
    private String pdfOutputPath;

    @Value("${warmup.html:}")
    private String warmupHtml;

    @Value("${debug:false}")
    private boolean debugEnabled;

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
                    .filter(this::isHtmlFile)
                    .forEach(file -> conversionExecutor.submit(() -> convertHtmlToPdf(file)));
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
                        String lowerName = filename.toString().toLowerCase();
                        if (lowerName.endsWith(".html") || lowerName.endsWith(".xhtml")) {
                            Path htmlFile = inputDir.resolve(filename);
                            conversionExecutor.submit(() -> convertHtmlToPdf(htmlFile));
                        }
                    }
                }
                key.reset();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void convertHtmlToPdf(Path htmlFile) {
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
        } catch (Exception e) {
            System.err.println("Error converting " + htmlFile + ": " + e.getMessage());
        } finally {
            if (Thread.interrupted()) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private String stripExtension(String name) {
        int idx = name.lastIndexOf('.');
        if (idx > 0) {
            return name.substring(0, idx);
        }
        return name;
    }

    private boolean isHtmlFile(Path file) {
        String lowerName = file.getFileName().toString().toLowerCase();
        return lowerName.endsWith(".html") || lowerName.endsWith(".xhtml");
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
        registerEmbeddedFonts(builder);
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

    private void registerEmbeddedFonts(PdfRendererBuilder builder) {
        registerFonts(builder, loadEmbeddedFontData());
    }

    private void registerFonts(PdfRendererBuilder builder, Map<String, byte[]> fonts) {
        if (builder == null || fonts == null || fonts.isEmpty()) {
            return;
        }
        for (Map.Entry<String, byte[]> entry : fonts.entrySet()) {
            String fileName = entry.getKey();
            byte[] fontBytes = entry.getValue();
            if (fontBytes == null || fontBytes.length == 0) {
                System.err.println("Skipping font " + fileName + " because it contains no data.");
                continue;
            }
            final byte[] fontBytesCopy = fontBytes;
            Set<String> aliases = loadedFontAliases.computeIfAbsent(fileName,
                    key -> deriveFontAliases(key, fontBytesCopy));
            if (aliases == null || aliases.isEmpty()) {
                System.err.println("Skipping font " + fileName + " because no aliases could be derived.");
                continue;
            }
            aliases.forEach(alias -> builder.useFont(() -> new ByteArrayInputStream(fontBytesCopy), alias));
        }
    }

    private Map<String, byte[]> loadEmbeddedFontData() {
        Map<String, byte[]> fonts = cachedFontData;
        if (fonts == null) {
            synchronized (fontLoadLock) {
                fonts = cachedFontData;
                if (fonts == null) {
                    fonts = Collections.unmodifiableMap(readFontsFromResources(FONT_RESOURCE_DIRECTORY));
                    cachedFontData = fonts;
                }
            }
        }
        return fonts;
    }

    private Map<String, byte[]> readFontsFromResources(String resourceFolder) {
        Map<String, byte[]> fonts = new LinkedHashMap<>();
        ResourcePatternResolver resolver = new PathMatchingResourcePatternResolver(getClass().getClassLoader());
        for (String extension : FONT_EXTENSIONS) {
            String pattern = String.format("classpath*:%s/**/*.%s", resourceFolder, extension);
            try {
                Resource[] resources = resolver.getResources(pattern);
                for (Resource resource : resources) {
                    if (!resource.isReadable()) {
                        continue;
                    }
                    String filename = resource.getFilename();
                    if (filename == null || fonts.containsKey(filename)) {
                        continue;
                    }
                    try (InputStream input = resource.getInputStream()) {
                        fonts.put(filename, input.readAllBytes());
                    }
                }
            } catch (IOException e) {
                System.err.println("Unable to load font resources for pattern " + pattern + ": " + e.getMessage());
            }
        }
        return fonts;
    }

    private Set<String> deriveFontAliases(String fileName, byte[] fontBytes) {
        Set<String> aliases = new LinkedHashSet<>();
        addAliasVariant(aliases, stripExtension(fileName));
        addAliasVariant(aliases, fileName);
        if (fontBytes != null && fontBytes.length > 0) {
            try (ByteArrayInputStream input = new ByteArrayInputStream(fontBytes)) {
                Font font = Font.createFont(Font.TRUETYPE_FONT, input);
                addAliasVariant(aliases, font.getFamily(Locale.ROOT));
                addAliasVariant(aliases, font.getFontName(Locale.ROOT));
                addAliasVariant(aliases, font.getPSName());
            } catch (FontFormatException | IOException e) {
                System.err.println("Unable to read font metadata from " + fileName + ": " + e.getMessage());
            }
        }
        return Collections.unmodifiableSet(aliases);
    }

    private void addAliasVariant(Set<String> aliases, String candidate) {
        if (candidate == null) {
            return;
        }
        String trimmed = candidate.trim();
        if (trimmed.isEmpty()) {
            return;
        }
        addIfPresent(aliases, trimmed);
        if (trimmed.contains(" ")) {
            addIfPresent(aliases, trimmed.replace(' ', '_'));
            addIfPresent(aliases, trimmed.replace(' ', '-'));
        }
        if (trimmed.contains("_")) {
            addIfPresent(aliases, trimmed.replace('_', ' '));
            addIfPresent(aliases, trimmed.replace('_', '-'));
        }
        if (trimmed.contains("-")) {
            addIfPresent(aliases, trimmed.replace('-', ' '));
            addIfPresent(aliases, trimmed.replace('-', '_'));
        }
    }

    private void addIfPresent(Set<String> aliases, String candidate) {
        if (candidate == null) {
            return;
        }
        String trimmed = candidate.trim();
        if (!trimmed.isEmpty()) {
            aliases.add(trimmed);
        }
    }
}
