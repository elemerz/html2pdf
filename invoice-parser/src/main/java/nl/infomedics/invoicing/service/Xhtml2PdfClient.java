package nl.infomedics.invoicing.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import nl.infomedics.invoicing.metrics.DiagnosticsRecorder;
import nl.infomedics.invoicing.model.BatchConversionItem;
import nl.infomedics.invoicing.model.BatchConversionRequest;
import nl.infomedics.invoicing.model.BatchConversionResponse;
import nl.infomedics.invoicing.model.BatchConversionResultItem;
import nl.infomedics.invoicing.model.HtmlToPdfResponse;
import nl.infomedics.invoicing.model.HtmlToPdfWithModelRequest;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
public class Xhtml2PdfClient {
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI convertEndpoint;
    private final URI batchConvertEndpoint;
    private final Duration requestTimeout;
    private final DiagnosticsRecorder diagnostics;

    public Xhtml2PdfClient(
            @Value("${xhtml2pdf.base-url:http://localhost:8080}") String baseUrl,
            @Value("${xhtml2pdf.request-timeout:PT30S}") Duration requestTimeout,
            @Value("${xhtml2pdf.connect-timeout:PT5S}") Duration connectTimeout,
            DiagnosticsRecorder diagnostics) {
        this.convertEndpoint = buildEndpoint(baseUrl, "/api/v1/pdf/convert-with-model");
        this.batchConvertEndpoint = buildEndpoint(baseUrl, "/api/v1/pdf/convert-batch");
        this.requestTimeout = requestTimeout;
        this.httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(connectTimeout)
                .build();
        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .registerModule(new JavaTimeModule());
        this.diagnostics = diagnostics;
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
            if (r.pdfContent()==null || r.pdfContent().length==0) throw new ConversionException("Empty PDF payload");
            return r.pdfContent();
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ConversionException("Conversion failed: " + e.getMessage(), e);
        }
    }

    public Map<String, byte[]> convertBatch(String html, boolean includeSanitisedXhtml, List<BatchConversionItem> items) throws ConversionException {
        if (html == null || html.isBlank()) throw new ConversionException("HTML must not be blank");
        if (items == null || items.isEmpty()) throw new ConversionException("Items must not be empty");
        try {
            BatchConversionRequest payload = new BatchConversionRequest(html, includeSanitisedXhtml, items.stream()
                .map(i -> new BatchConversionItem(i.jsonModel(), i.outputId()))
                .collect(Collectors.toList()));
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest req = HttpRequest.newBuilder(batchConvertEndpoint)
                    .timeout(requestTimeout.multipliedBy(Math.max(2, items.size() / 10)))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();
            Map<String, byte[]> results;
            try (var timer = diagnostics.start("parser.pdf.http", Map.of(
                    "endpoint", "convert-batch",
                    "items", Integer.toString(items.size())
            ))) {
                HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (resp.statusCode() >= 400) throw new ConversionException("Remote error status=" + resp.statusCode());
                BatchConversionResponse r = objectMapper.readValue(resp.body(), BatchConversionResponse.class);
                results = r.results().stream()
                    .filter(result -> result.pdfContent() != null && result.error() == null)
                    .collect(Collectors.toMap(
                            BatchConversionResultItem::outputId,
                        BatchConversionResultItem::pdfContent
                    ));
            }
            return results;
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ConversionException("Batch conversion failed: " + e.getMessage(), e);
        }
    }

    private URI buildEndpoint(String baseUrl, String path) {
        String norm = Objects.requireNonNullElse(baseUrl, "").replaceAll("/+$", "");
        if (norm.isEmpty()) norm = "http://localhost:8080";
        return URI.create(norm + path);
    }

    public static class ConversionException extends Exception {
        private static final long serialVersionUID = 8288132479461418327L;
        public ConversionException(String m){super(m);} public ConversionException(String m, Throwable c){super(m,c);} }
}
