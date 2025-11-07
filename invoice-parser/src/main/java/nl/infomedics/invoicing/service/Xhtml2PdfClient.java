package nl.infomedics.invoicing.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Objects;

@Service
public class Xhtml2PdfClient {
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI convertEndpoint;
    private final Duration requestTimeout;

    public Xhtml2PdfClient(
            @Value("${xhtml2pdf.base-url:http://localhost:8080}") String baseUrl,
            @Value("${xhtml2pdf.request-timeout:PT30S}") Duration requestTimeout,
            @Value("${xhtml2pdf.connect-timeout:PT5S}") Duration connectTimeout) {
        this.convertEndpoint = buildEndpoint(baseUrl);
        this.requestTimeout = requestTimeout;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(connectTimeout)
                .build();
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .registerModule(new JavaTimeModule());
    }

    public byte[] convert(String html, String jsonModel) throws ConversionException {
        if (html == null || html.isBlank()) throw new ConversionException("HTML must not be blank");
        if (jsonModel == null || jsonModel.isBlank()) jsonModel = "{}";
        HtmlToPdfWithModelRequest payload = new HtmlToPdfWithModelRequest(html, jsonModel, false);
        try {
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder(convertEndpoint)
                    .timeout(requestTimeout)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() >= 400) throw new ConversionException("Remote error status=" + resp.statusCode());
            HtmlToPdfResponse r = objectMapper.readValue(resp.body(), HtmlToPdfResponse.class);
            if (r.pdfBase64()==null || r.pdfBase64().isBlank()) throw new ConversionException("Empty PDF payload");
            return Base64.getDecoder().decode(r.pdfBase64());
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ConversionException("Conversion failed: " + e.getMessage(), e);
        }
    }

    private URI buildEndpoint(String baseUrl) {
        String norm = Objects.requireNonNullElse(baseUrl, "").replaceAll("/+$", "");
        if (norm.isEmpty()) norm = "http://localhost:8080";
        return URI.create(norm + "/api/v1/pdf/convert-with-model");
    }

    public record HtmlToPdfWithModelRequest(String html, String jsonModel, boolean includeSanitisedXhtml) {}
    public record HtmlToPdfResponse(String pdfBase64, String sanitisedXhtml, java.time.Instant generatedAt) {}
    public static class ConversionException extends Exception {
        public ConversionException(String m){super(m);} public ConversionException(String m, Throwable c){super(m,c);} }
}
