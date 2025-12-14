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

import okhttp3.ConnectionPool;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.Protocol;
import okio.BufferedSink;

import jakarta.annotation.PreDestroy;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

@Service
public class Xhtml2PdfClient {
    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final URI convertEndpoint;
    private final URI batchConvertEndpoint;
    private final Duration requestTimeout;
    private final DiagnosticsRecorder diagnostics;

    public Xhtml2PdfClient(
            @Value("${xhtml2pdf.base-url:https://localhost:8080}") String baseUrl,
            @Value("${xhtml2pdf.request-timeout:PT30S}") Duration requestTimeout,
            @Value("${xhtml2pdf.connect-timeout:PT5S}") Duration connectTimeout,
            @Value("${xhtml2pdf.ssl.trust-store:}") String trustStorePath,
            @Value("${xhtml2pdf.ssl.trust-store-password:}") String trustStorePassword,
            @Value("${xhtml2pdf.max-connections:200}") int maxConnections,
            @Value("${xhtml2pdf.max-idle-connections:50}") int maxIdleConnections,
            @Value("${xhtml2pdf.keep-alive-duration:PT5M}") Duration keepAliveDuration,
            DiagnosticsRecorder diagnostics) {
        this.convertEndpoint = buildEndpoint(baseUrl, "/api/v1/pdf/convert-with-model");
        this.batchConvertEndpoint = buildEndpoint(baseUrl, "/api/v1/pdf/convert-batch");
        this.requestTimeout = requestTimeout;
        
        // Configure TLS trust store if provided
        SSLContext sslContext = null;
        X509TrustManager trustManager = null;
        if (trustStorePath != null && !trustStorePath.isBlank()) {
            try {
                java.security.KeyStore ks = java.security.KeyStore.getInstance("PKCS12");
                try (java.io.FileInputStream fis = new java.io.FileInputStream(trustStorePath)) {
                    ks.load(fis, trustStorePassword != null ? trustStorePassword.toCharArray() : null);
                }
                TrustManagerFactory tmf = TrustManagerFactory.getInstance(
                    TrustManagerFactory.getDefaultAlgorithm());
                tmf.init(ks);
                sslContext = SSLContext.getInstance("TLS");
                sslContext.init(null, tmf.getTrustManagers(), new java.security.SecureRandom());
                trustManager = (X509TrustManager) tmf.getTrustManagers()[0];
            } catch (Exception e) {
                throw new RuntimeException("Failed to configure TLS trust store: " + e.getMessage(), e);
            }
        }
        
        // Build OkHttp client with connection pooling and HTTP/2 support
        ConnectionPool connectionPool = new ConnectionPool(
            maxIdleConnections,
            keepAliveDuration.toMillis(),
            TimeUnit.MILLISECONDS
        );
        
        OkHttpClient.Builder builder = new OkHttpClient.Builder()
                .connectionPool(connectionPool)
                .connectTimeout(connectTimeout.toMillis(), TimeUnit.MILLISECONDS)
                .readTimeout(requestTimeout.toMillis(), TimeUnit.MILLISECONDS)
                .writeTimeout(requestTimeout.toMillis(), TimeUnit.MILLISECONDS)
                .callTimeout(requestTimeout.multipliedBy(2).toMillis(), TimeUnit.MILLISECONDS)
                .protocols(Arrays.asList(Protocol.HTTP_2, Protocol.HTTP_1_1))
                .retryOnConnectionFailure(true);
        
        if (sslContext != null && trustManager != null) {
            builder.sslSocketFactory(sslContext.getSocketFactory(), trustManager);
            // Disable hostname verification for localhost development
            builder.hostnameVerifier((hostname, session) -> true);
        }
        
        this.httpClient = builder.build();
        
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
            RequestBody requestBody = createStreamingRequestBody(payload);
            
            Request request = new Request.Builder()
                    .url(convertEndpoint.toString())
                    .post(requestBody)
                    .header("Accept", "application/json")
                    .build();
            
            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    throw new ConversionException("Remote error status=" + response.code());
                }
                String responseBody = response.body().string();
                HtmlToPdfResponse r = objectMapper.readValue(responseBody, HtmlToPdfResponse.class);
                if (r.pdfContent() == null || r.pdfContent().length == 0) {
                    throw new ConversionException("Empty PDF payload");
                }
                return r.pdfContent();
            }
        } catch (IOException e) {
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
            RequestBody requestBody = createStreamingRequestBody(payload);
            
            // Build request with extended timeout for batch operations
            long batchTimeoutMillis = requestTimeout.multipliedBy(Math.max(2, items.size() / 10)).toMillis();
            OkHttpClient batchClient = httpClient.newBuilder()
                    .readTimeout(batchTimeoutMillis, TimeUnit.MILLISECONDS)
                    .callTimeout(batchTimeoutMillis * 2, TimeUnit.MILLISECONDS)
                    .build();
            
            Request request = new Request.Builder()
                    .url(batchConvertEndpoint.toString())
                    .post(requestBody)
                    .header("Accept", "application/json")
                    .build();
            
            Map<String, byte[]> results;
            try (var timer = diagnostics.start("parser.pdf.http", Map.of(
                    "endpoint", "convert-batch",
                    "items", Integer.toString(items.size())
            ))) {
                int attempts = 0;
                while (true) {
                    try (Response response = batchClient.newCall(request).execute()) {
                        if (!response.isSuccessful()) {
                            String errorBody = response.body() != null ? response.body().string() : "";
                            String errorDetails = String.format("Remote error status=%d, body=%s", 
                                response.code(), errorBody);
                            throw new ConversionException(errorDetails);
                        }
                        String responseBody = response.body().string();
                        BatchConversionResponse r = objectMapper.readValue(responseBody, BatchConversionResponse.class);
                        results = r.results().stream()
                            .filter(result -> result.pdfContent() != null && result.error() == null)
                            .collect(Collectors.toMap(
                                    BatchConversionResultItem::outputId,
                                BatchConversionResultItem::pdfContent
                            ));
                        break;
                    } catch (IOException ioex) {
                        // Retry transient connection errors with exponential backoff
                        String msg = ioex.getMessage();
                        boolean isRetryable = msg != null && (
                            msg.contains("Connection reset") || 
                            msg.contains("Broken pipe") ||
                            msg.contains("timeout") ||
                            msg.contains("stream was reset"));
                        if (isRetryable && attempts < 3) {
                            attempts++;
                            long backoffMs = (long) Math.min(2000, 200 * Math.pow(2, attempts - 1));
                            try { Thread.sleep(backoffMs); } catch (InterruptedException ie) { 
                                Thread.currentThread().interrupt(); 
                                throw new ConversionException("Batch conversion interrupted", ie); 
                            }
                            continue;
                        }
                        throw ioex;
                    }
                }
            }
            return results;
        } catch (IOException e) {
            throw new ConversionException("Batch conversion failed: " + e.getMessage(), e);
        }
    }

    private <T> RequestBody createStreamingRequestBody(T payload) {
        return new RequestBody() {
            @Override
            public MediaType contentType() {
                return MediaType.get("application/json; charset=utf-8");
            }

            @Override
            public void writeTo(BufferedSink sink) throws IOException {
                objectMapper.writeValue(sink.outputStream(), payload);
            }
        };
    }

    private URI buildEndpoint(String baseUrl, String path) {
        String norm = Objects.requireNonNullElse(baseUrl, "").replaceAll("/+$", "");
        if (norm.isEmpty()) norm = "https://localhost:8080";
        return URI.create(norm + path);
    }

    @PreDestroy
    public void shutdown() {
        if (httpClient != null) {
            httpClient.dispatcher().executorService().shutdown();
            httpClient.connectionPool().evictAll();
        }
    }

    public static class ConversionException extends Exception {
        private static final long serialVersionUID = 8288132479461418327L;
        public ConversionException(String m){super(m);} public ConversionException(String m, Throwable c){super(m,c);} }
}
