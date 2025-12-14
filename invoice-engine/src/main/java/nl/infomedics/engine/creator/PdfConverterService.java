package nl.infomedics.engine.creator;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
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

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;

import lombok.extern.slf4j.Slf4j;
import nl.infomedics.engine.config.EngineProperties;
import nl.infomedics.engine.metrics.DiagnosticsRecorder;

@Slf4j
@Service
public class PdfConverterService {
    
    private static final ThreadLocal<DocumentBuilder> DOCUMENT_BUILDER = ThreadLocal.withInitial(() -> {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            return factory.newDocumentBuilder();
        } catch (Exception e) {
            throw new RuntimeException("Failed to create DocumentBuilder", e);
        }
    });

    private static final ThreadLocal<ByteArrayOutputStream> BUFFER_POOL = 
        ThreadLocal.withInitial(() -> new ByteArrayOutputStream(256 * 1024));

    private static final long CONVERSION_IDLE_THRESHOLD_MS = 1_000L;
    private static final DateTimeFormatter TIMESTAMP_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final ZoneId SYSTEM_ZONE = ZoneId.systemDefault();

    private final QrBarcodeObjectFactory objectFactory = new QrBarcodeObjectFactory();
    private final FontRegistry fontRegistry;
    private final Semaphore conversionPermits;
    private final AtomicInteger activeConversions = new AtomicInteger();
    private final AtomicInteger peakConversions = new AtomicInteger();
    private final AtomicLong firstConversionStartMillis = new AtomicLong();
    private final AtomicLong lastConversionFinishMillis = new AtomicLong();
    private final AtomicReference<ScheduledFuture<?>> pendingBatchCompletionLog = new AtomicReference<>();
    private final ScheduledExecutorService conversionTimingExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "conversion-timing");
        thread.setDaemon(true);
        return thread;
    });
    private final int maxConcurrent;
    private final byte[] srgbColorProfile;
    private final DiagnosticsRecorder diagnostics;
    private final boolean enableBufferReuse;

    public PdfConverterService(FontRegistry fontRegistry,
                               EngineProperties properties,
                               DiagnosticsRecorder diagnostics) {
        this.fontRegistry = fontRegistry;
        this.diagnostics = diagnostics;
        this.srgbColorProfile = loadSrgbColorProfile();
        this.maxConcurrent = Math.max(1, properties.getPdf().getMaxConcurrent());
        this.conversionPermits = new Semaphore(this.maxConcurrent);
        this.enableBufferReuse = properties.getPdf().isEnableBufferReuse();
        
        log.info("PdfConverterService initialized: maxConcurrent={}, bufferReuse={}",
                this.maxConcurrent, this.enableBufferReuse);
    }

    public byte[] convertHtmlToPdf(String htmlContent) throws PdfConversionException {
        if (htmlContent == null || htmlContent.isBlank()) {
            throw new PdfConversionException("HTML content must not be null or blank");
        }

        long startTime = System.currentTimeMillis();
        try {
            conversionPermits.acquire();
            int current = activeConversions.incrementAndGet();
            int peak = peakConversions.updateAndGet(prev -> Math.max(prev, current));
            log.info("Active conversions: {}/{} (peak: {})", current, maxConcurrent, peak);
            
            noteConversionStarted();
            
            try (var timer = diagnostics.start("engine.pdf.convert", 
                    java.util.Map.of("concurrent", String.valueOf(current)))) {
                
                String cleanedHtml = stripBom(htmlContent);
                Document document = parseDocument(cleanedHtml);
                objectFactory.preprocessDocument(document);
                
                byte[] result = renderToPdf(document, cleanedHtml);
                
                long duration = System.currentTimeMillis() - startTime;
                log.info("{} Conversion time: {} ms", LocalTime.now().format(TIMESTAMP_FORMATTER), duration);
                
                return result;
                
            } finally {
                activeConversions.decrementAndGet();
                conversionPermits.release();
                trackBatchCompletion();
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new PdfConversionException("Interrupted while waiting for conversion permit", ie);
        } catch (Exception e) {
            log.error("PDF conversion failed", e);
            throw new PdfConversionException("PDF conversion failed: " + e.getMessage(), e);
        }
    }

    private Document parseDocument(String htmlContent) throws Exception {
        try (InputStream is = new ByteArrayInputStream(htmlContent.getBytes(StandardCharsets.UTF_8))) {
            DocumentBuilder builder = DOCUMENT_BUILDER.get();
            builder.reset();
            Document document = builder.parse(is);
            document.getDocumentElement().normalize();
            return document;
        }
    }

    private byte[] renderToPdf(Document document, String fallbackHtml) throws IOException {
        ByteArrayOutputStream buffer;
        
        if (enableBufferReuse) {
            buffer = BUFFER_POOL.get();
            buffer.reset();
        } else {
            buffer = new ByteArrayOutputStream(256 * 1024);
        }

        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useSVGDrawer(new BatikSVGDrawer());
            builder.useObjectDrawerFactory(objectFactory);
            builder.usePdfVersion(1.4f);
            builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.PDFA_2_A);
            builder.useColorProfile(srgbColorProfile);
            fontRegistry.registerEmbeddedFonts(builder);
            
            if (document != null) {
                builder.withW3cDocument(document, "about:blank");
            } else {
                builder.withHtmlContent(fallbackHtml, "about:blank");
            }
            
            builder.toStream(buffer);
            builder.run();
            
            return buffer.toByteArray();
        } catch (Exception e) {
            throw new IOException("PDF rendering failed: " + e.getMessage(), e);
        }
    }

    private byte[] loadSrgbColorProfile() {
        ClassPathResource resource = new ClassPathResource("colorspaces/sRGB.icc");
        try (InputStream is = resource.getInputStream()) {
            return is.readAllBytes();
        } catch (IOException e) {
            throw new IllegalStateException("Unable to load sRGB color profile", e);
        }
    }

    private String stripBom(String input) {
        if (input == null || input.isEmpty()) return input;
        if (input.charAt(0) == '\uFEFF') {
            return input.substring(1);
        }
        return input;
    }

    public int getActiveConversions() {
        return activeConversions.get();
    }

    public int getPeakConversions() {
        return peakConversions.get();
    }

    private void noteConversionStarted() {
        ScheduledFuture<?> pending = pendingBatchCompletionLog.getAndSet(null);
        if (pending != null) {
            pending.cancel(false);
        }
        long now = System.currentTimeMillis();
        firstConversionStartMillis.compareAndSet(0L, now);
    }

    private void trackBatchCompletion() {
        long finishMillis = System.currentTimeMillis();
        scheduleBatchCompletionCheck(finishMillis);
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

    public static class PdfConversionException extends Exception {
        private static final long serialVersionUID = 1L;
        
        public PdfConversionException(String message) {
            super(message);
        }
        
        public PdfConversionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
