package nl.infomedics.reporting.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;

import lombok.extern.slf4j.Slf4j;

/**
 * Converts XHTML input into PDF output and tracks conversion statistics.
 */
@Slf4j
@Service
public class Html2PdfConverterService {
    private static final ThreadLocal<DocumentBuilder> DOCUMENT_BUILDER = ThreadLocal.withInitial(() -> {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            return factory.newDocumentBuilder();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    });

    private static final ThreadLocal<Transformer> TRANSFORMER = ThreadLocal.withInitial(() -> {
        try {
            return TransformerFactory.newInstance().newTransformer();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    });

    private final QrBarcodeObjectFactory objectFactory = new QrBarcodeObjectFactory();
    private final FontRegistry fontRegistry;
    private static final long CONVERSION_IDLE_THRESHOLD_MS = 1_000L;
    private static final DateTimeFormatter TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final ZoneId SYSTEM_ZONE = ZoneId.systemDefault();
    private final Semaphore conversionPermits;
    private final AtomicInteger activeConversions = new AtomicInteger();
    private final AtomicInteger peakConcurrentConversions = new AtomicInteger();
    private final AtomicLong firstConversionStartMillis = new AtomicLong();
    private final AtomicLong lastConversionFinishMillis = new AtomicLong();
    private final AtomicReference<ScheduledFuture<?>> pendingBatchCompletionLog = new AtomicReference<>();
    private final ScheduledExecutorService conversionTimingExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "conversion-timing");
        thread.setDaemon(true);
        return thread;
    });
    private final int maxConcurrentConversions;
    private final byte[] srgbColorProfile;

    /**
     * Creates the converter service with an injected font registry for renderer configuration.
     *
     * @param fontRegistry            registry responsible for exposing embedded fonts
     * @param configuredMaxConcurrent configured concurrency limit
     */
    public Html2PdfConverterService(FontRegistry fontRegistry,
                                    @Value("${converter.max-concurrent:16}") int configuredMaxConcurrent) {
        this.fontRegistry = fontRegistry;
        this.srgbColorProfile = loadSrgbColorProfile();
        if (configuredMaxConcurrent < 1) {
            log.warn("Configured converter.max-concurrent {} is invalid; defaulting to 1.", configuredMaxConcurrent);
        }
        this.maxConcurrentConversions = Math.max(1, configuredMaxConcurrent);
        this.conversionPermits = new Semaphore(this.maxConcurrentConversions);
        log.debug("Html2PdfConverterService concurrency limited to {} simultaneous conversions.",
                this.maxConcurrentConversions);
    }

    /**
     * Converts the supplied XHTML content into a PDF document.
     *
     * @param htmlContent XHTML content to convert
     * @return {@link PdfConversionResult} containing the PDF bytes and optional sanitised XHTML snapshot
     * @throws HtmlToPdfConversionException when conversion fails or the thread is interrupted
     */
    public PdfConversionResult convertHtmlToPdf(String htmlContent) throws HtmlToPdfConversionException {
        if (htmlContent == null) {
            throw new HtmlToPdfConversionException("HTML content must not be null.");
        }
        try (ConversionPermit _ = acquireConversionPermit()) {
            long startMillis = System.currentTimeMillis();
            noteConversionStarted();
            try {
                Document document = parseDocumentSafely(htmlContent);
                String sanitisedXhtml = null;
                if (document != null) {
                    objectFactory.preprocessDocument(document);
                    sanitisedXhtml = serializeDocument(document);
                }
                byte[] pdfBytes = renderToPdf(document, htmlContent);

                long duration = System.currentTimeMillis() - startMillis;
                String timestamp = LocalTime.now().format(TIMESTAMP_FORMATTER);
                log.info("{} Conversion time: {} ms", timestamp, duration);

                return new PdfConversionResult(pdfBytes, sanitisedXhtml);
            } catch (Exception e) {
                log.error("Error converting XHTML content", e);
                throw new HtmlToPdfConversionException("Unable to convert XHTML content", e);
            } finally {
                long finishMillis = System.currentTimeMillis();
                scheduleBatchCompletionCheck(finishMillis);
                if (Thread.interrupted()) {
                    Thread.currentThread().interrupt();
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new HtmlToPdfConversionException("Interrupted while waiting to acquire conversion permit", ie);
        }
    }

    private Document parseDocumentSafely(String htmlContent) {
        try (InputStream in = new ByteArrayInputStream(htmlContent.getBytes(StandardCharsets.UTF_8))) {
            return parseDocument(in);
        } catch (Exception ex) {
            log.warn("Unable to parse supplied XHTML content: {}", ex.getMessage());
            return null;
        }
    }

    private final java.util.concurrent.ConcurrentHashMap<Integer, Integer> templateSizeHint = new java.util.concurrent.ConcurrentHashMap<>();

    private byte[] renderToPdf(Document document, String htmlContent) throws IOException {
        int key = htmlContent != null ? htmlContent.hashCode() : System.identityHashCode(document);
        int initialSize = Math.max(8 * 1024, templateSizeHint.getOrDefault(key, 64 * 1024));
        try (ByteArrayOutputStream os = new ByteArrayOutputStream(initialSize)) {
            renderToPdf(document, htmlContent, os);
            byte[] bytes = os.toByteArray();
            templateSizeHint.merge(key, bytes.length, (prev, cur) -> {
                int avg = (prev + cur) >>> 1;
                int cap = 8 * 1024 * 1024; // cap at 8MB
                return Math.min(avg, cap);
            });
            return bytes;
        }
    }

    private void renderToPdf(Document document, String htmlContent, OutputStream os) throws IOException {
        try {
            PdfRendererBuilder builder = configuredBuilderSkeleton();
            if (document != null) {
                builder.withW3cDocument(document, "about:blank");
            } else {
                builder.withHtmlContent(htmlContent, "about:blank");
            }
            builder.toStream(os);
            builder.run();
        } catch (Exception ex) {
            throw new IOException("Unable to render PDF", ex);
        }
    }

    private PdfRendererBuilder configuredBuilderSkeleton() {
        PdfRendererBuilder builder = new PdfRendererBuilder();
        builder.useSVGDrawer(new BatikSVGDrawer());
        builder.useObjectDrawerFactory(objectFactory);
        builder.usePdfVersion(1.4f);
        builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.PDFA_2_A); //NONE
        builder.useColorProfile(srgbColorProfile);
        fontRegistry.registerEmbeddedFonts(builder);
        return builder;
    }

    private byte[] loadSrgbColorProfile() {
        ClassPathResource resource = new ClassPathResource("colorspaces/sRGB.icc");
        try (InputStream inputStream = resource.getInputStream()) {
            return inputStream.readAllBytes();
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to load sRGB color profile required for PDF/A output.", ex);
        }
    }

    private String serializeDocument(Document document) throws Exception {
        Transformer transformer = TRANSFORMER.get();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.setOutputProperty(OutputKeys.METHOD, "xml");
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            transformer.transform(new DOMSource(document), new StreamResult(out));
            return out.toString(StandardCharsets.UTF_8);
        }
    }

    private ConversionPermit acquireConversionPermit() throws InterruptedException {
        conversionPermits.acquire();
        int current = activeConversions.incrementAndGet();
        int peak = peakConcurrentConversions.updateAndGet(prev -> Math.max(prev, current));
        logActiveConversions(current, peak);
        return new ConversionPermit();
    }

    private void logActiveConversions(int current, int peak) {
        log.info("Active conversions: {}/{} (peak: {})", current, maxConcurrentConversions, peak);
    }

    private void noteConversionStarted() {
        ScheduledFuture<?> pending = pendingBatchCompletionLog.getAndSet(null);
        if (pending != null) {
            pending.cancel(false);
        }
        long now = System.currentTimeMillis();
        firstConversionStartMillis.compareAndSet(0L, now);
    }

    private void scheduleBatchCompletionCheck(long finishMillis) {
        lastConversionFinishMillis.set(finishMillis);
        final ScheduledFuture<?>[] holder = new ScheduledFuture<?>[1];
        Runnable task = () -> handlePotentialBatchCompletion(finishMillis, holder[0]);
        ScheduledFuture<?> future = conversionTimingExecutor.schedule(task, CONVERSION_IDLE_THRESHOLD_MS, TimeUnit.MILLISECONDS);
        holder[0] = future;
        ScheduledFuture<?> previous = pendingBatchCompletionLog.getAndSet(future);
        if (previous != null) {
            previous.cancel(false);
        }
    }

    private void handlePotentialBatchCompletion(long scheduledFinishMillis, ScheduledFuture<?> future) {
        if (future == null) {
            return;
        }
        if (!pendingBatchCompletionLog.compareAndSet(future, null)) {
            return;
        }
        if (activeConversions.get() != 0) {
            return;
        }
        long start = firstConversionStartMillis.get();
        if (start == 0L) {
            return;
        }
        long finishMillis = Math.max(lastConversionFinishMillis.get(), scheduledFinishMillis);
        long elapsed = Math.max(finishMillis - start, 0L);
        String timestamp = LocalTime.now().format(TIMESTAMP_FORMATTER);
        log.info("{} Conversion batch elapsed: {} ms (first at {}, last at {})",
                timestamp, elapsed, formatClockTime(start), formatClockTime(finishMillis));
        firstConversionStartMillis.compareAndSet(start, 0L);
    }

    private String formatClockTime(long epochMillis) {
        return Instant.ofEpochMilli(epochMillis).atZone(SYSTEM_ZONE).toLocalTime().format(TIMESTAMP_FORMATTER);
    }

    private Document parseDocument(InputStream input) throws Exception {
        DocumentBuilder builder = DOCUMENT_BUILDER.get();
        builder.reset();
        Document document = builder.parse(input);
        document.getDocumentElement().normalize();
        return document;
    }

    /**
     * Result wrapper that exposes the generated PDF and an optional sanitised XHTML snapshot.
     */
    public record PdfConversionResult(byte[] pdfContent, String sanitisedXhtml) { }

    /**
     * Exception raised when XHTML-to-PDF conversion fails.
     */
    public static class HtmlToPdfConversionException extends Exception {
        private static final long serialVersionUID = 7231358555978999078L;

        public HtmlToPdfConversionException(String message) {
            super(message);
        }

        public HtmlToPdfConversionException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private final class ConversionPermit implements AutoCloseable {
        private boolean closed;

        @Override
        public void close() {
            if (closed) {
                return;
            }
            closed = true;
            int current = activeConversions.decrementAndGet();
            conversionPermits.release();
            logActiveConversions(current, peakConcurrentConversions.get());
        }
    }
}
