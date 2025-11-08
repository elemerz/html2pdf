package nl.infomedics.invoicing.service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import jakarta.annotation.PreDestroy;

/**
 * Thin HTTP client delegating HTML-to-PDF conversion to the invoice-processor service.
 */
@Service
public class InvoiceProcessorClient {

    private final HttpClient httpClient;
    private final ExecutorService httpExecutor;
    private final ObjectMapper objectMapper;
    private final URI convertEndpoint;
    private final Duration requestTimeout;

    public InvoiceProcessorClient(
            @Value("${invoice.processor.base-url:http://localhost:8080}") String processorBaseUrl,
            @Value("${invoice.processor.request-timeout:PT30S}") Duration requestTimeout,
            @Value("${invoice.processor.connect-timeout:PT5S}") Duration connectTimeout,
            @Value("${invoice.processor.max-concurrent-requests:64}") int maxConcurrentRequests) {
        this.convertEndpoint = buildEndpoint(processorBaseUrl);
        this.requestTimeout = requestTimeout;
        this.httpExecutor = Executors.newFixedThreadPool(Math.max(1, maxConcurrentRequests), r -> {
            Thread thread = new Thread(r);
            thread.setName("http-client-" + thread.getId());
            thread.setDaemon(false);
            return thread;
        });
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(connectTimeout)
                .executor(httpExecutor)
                .build();
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .registerModule(new JavaTimeModule());
        System.out.println("InvoiceProcessorClient initialized with max " + maxConcurrentRequests + " concurrent requests");
    }

    @PreDestroy
    public void shutdown() {
        System.out.println("Shutting down InvoiceProcessorClient...");
        httpExecutor.shutdown();
        try {
            if (!httpExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                httpExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            httpExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    public PdfConversionResult convertHtmlToPdf(String htmlContent) throws PdfConversionException {
        if (htmlContent == null || htmlContent.isBlank()) {
            throw new PdfConversionException("HTML content must not be blank.");
        }
        HtmlToPdfRequest payload = new HtmlToPdfRequest(htmlContent, true);
        int maxRetries = 3;
        long retryDelayMs = 1000L;
        
        for (int attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                String requestBody = objectMapper.writeValueAsString(payload);
                HttpRequest request = HttpRequest.newBuilder(convertEndpoint)
                        .timeout(requestTimeout)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (response.statusCode() >= 400) {
                    throw new PdfConversionException("Remote service responded with status " + response.statusCode()
                            + " and body: " + response.body());
                }
                HtmlToPdfResponse responsePayload = objectMapper.readValue(response.body(), HtmlToPdfResponse.class);
                if (responsePayload.pdfBase64() == null || responsePayload.pdfBase64().isBlank()) {
                    throw new PdfConversionException("Remote service returned an empty PDF payload.");
                }
                byte[] pdfBytes = Base64.getDecoder().decode(responsePayload.pdfBase64());
                return new PdfConversionResult(pdfBytes, responsePayload.sanitisedXhtml());
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                throw new PdfConversionException("Interrupted while waiting for remote conversion", ie);
            } catch (IOException ioe) {
                if (attempt == maxRetries) {
                    throw new PdfConversionException("Unable to invoke remote conversion service after " + maxRetries + " attempts", ioe);
                }
                System.err.println("Conversion attempt " + attempt + " failed, retrying: " + ioe.getMessage());
                try {
                    Thread.sleep(retryDelayMs * attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new PdfConversionException("Interrupted while waiting to retry", ie);
                }
            }
        }
        throw new PdfConversionException("Unable to invoke remote conversion service");
    }

    private URI buildEndpoint(String baseUrl) {
        String normalised = Objects.requireNonNullElse(baseUrl, "")
                .replaceAll("/+$", "");
        if (normalised.isEmpty()) {
            normalised = "http://localhost:8080";
        }
        return URI.create(normalised + "/api/v1/pdf/convert");
    }

    public record PdfConversionResult(byte[] pdfContent, String sanitisedXhtml) { }

    public record HtmlToPdfRequest(String html, boolean includeSanitisedXhtml) { }

    public record HtmlToPdfResponse(String pdfBase64, String sanitisedXhtml, Instant generatedAt) { }

    public static class PdfConversionException extends Exception {
        private static final long serialVersionUID = 312139412231131757L;

		public PdfConversionException(String message) {
            super(message);
        }

        public PdfConversionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
