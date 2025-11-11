package nl.infomedics.xhtml2pdf.web;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import nl.infomedics.reporting.service.Html2PdfConverterService;
import nl.infomedics.reporting.service.Html2PdfConverterService.HtmlToPdfConversionException;
import nl.infomedics.reporting.service.Html2PdfConverterService.PdfConversionResult;
import nl.infomedics.xhtml2pdf.web.dto.BatchConversionItem;
import nl.infomedics.xhtml2pdf.web.dto.BatchConversionRequest;
import nl.infomedics.xhtml2pdf.web.dto.BatchConversionResponse;
import nl.infomedics.xhtml2pdf.web.dto.BatchConversionResultItem;
import nl.infomedics.xhtml2pdf.web.dto.HtmlToPdfRequest;
import nl.infomedics.xhtml2pdf.web.dto.HtmlToPdfResponse;
import nl.infomedics.xhtml2pdf.web.dto.HtmlToPdfWithModelRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import nl.infomedics.invoicing.model.Debiteur;

/**
 * REST controller exposing HTML-to-PDF conversion endpoints.
 */
@RestController
@RequestMapping(path = "/api/v1/pdf")
@Validated
@Slf4j
public class HtmlToPdfController {

    private final Html2PdfConverterService converterService;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    public HtmlToPdfController(Html2PdfConverterService converterService) {
        this.converterService = converterService;
    }

    @PostMapping(
            path = "/convert",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<HtmlToPdfResponse> convertHtmlToPdf(@Valid @RequestBody HtmlToPdfRequest request)
            throws HtmlToPdfConversionException {
        int requestSize = request.html() != null ? request.html().length() : 0;
        // debug: received single conversion request size
        if (requestSize > 0 && requestSize < 200) { /* small; omit */ }
        
        PdfConversionResult result = converterService.convertHtmlToPdf(request.html());
        String pdfBase64 = Base64.getEncoder().encodeToString(result.pdfContent());
        String sanitised = request.includeSanitisedXhtml() ? result.sanitisedXhtml() : null;
        HtmlToPdfResponse response = new HtmlToPdfResponse(pdfBase64, sanitised, Instant.now());
        return ResponseEntity.ok(response);
    }

    @PostMapping(
            path = "/convert-with-model",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<HtmlToPdfResponse> convertHtmlToPdfWithModel(@Valid @RequestBody HtmlToPdfWithModelRequest request)
            throws HtmlToPdfConversionException {
        int requestSize = request.html() != null ? request.html().length() : 0;
        // debug: received conversion-with-model (sizes suppressed for perf)
        PdfConversionResult result = converterService.convertHtmlToPdf(request.html()); // jsonModel currently unused
        String pdfBase64 = Base64.getEncoder().encodeToString(result.pdfContent());
        String sanitised = request.includeSanitisedXhtml() ? result.sanitisedXhtml() : null;
        HtmlToPdfResponse response = new HtmlToPdfResponse(pdfBase64, sanitised, Instant.now());
        return ResponseEntity.ok(response);
    }

    @PostMapping(
            path = "/convert-batch",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<BatchConversionResponse> convertBatch(@Valid @RequestBody BatchConversionRequest request) {
        // debug: batch conversion items=" + request.items().size()
        
        List<CompletableFuture<BatchConversionResultItem>> futures = request.items().stream()
                .map(item -> CompletableFuture.supplyAsync(() -> convertSingleItem(request.html(), request.includeSanitisedXhtml(), item)))
                .collect(Collectors.toList());
        
        List<BatchConversionResultItem> results = futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList());
        
        BatchConversionResponse response = new BatchConversionResponse(results, Instant.now());
        return ResponseEntity.ok(response);
    }
    
    private Debiteur parseDebiteur(String jsonModel) throws Exception {
        if (jsonModel == null || jsonModel.isBlank()) return new Debiteur();
        JsonNode root = OBJECT_MAPPER.readTree(jsonModel);
        if (root.isObject() && root.has("debiteur") && root.get("debiteur").isObject()) {
            root = root.get("debiteur");
        }
        return OBJECT_MAPPER.treeToValue(root, Debiteur.class);
    }

    private BatchConversionResultItem convertSingleItem(String sharedHtml, boolean includeSanitised, BatchConversionItem item) {
        try {
            Debiteur debiteur = null;
            try {
                debiteur = parseDebiteur(item.jsonModel());
            } catch (Exception parseEx) {
                log.warn("Failed to parse debiteur model for {}: {}", item.outputId(), parseEx.getMessage());
            }
            String htmlResolved = debiteur != null ? resolvePropertyPlaceholders(sharedHtml, debiteur) : sharedHtml;
            log.info("sharedHtml = {}", sharedHtml);
            log.info("htmlResolved = {}", htmlResolved);
            PdfConversionResult result = converterService.convertHtmlToPdf(htmlResolved);
            String pdfBase64 = Base64.getEncoder().encodeToString(result.pdfContent());
            String sanitised = includeSanitised ? result.sanitisedXhtml() : null;
            return BatchConversionResultItem.success(item.outputId(), pdfBase64, sanitised);
        } catch (Exception e) {
            System.err.println("Batch item " + item.outputId() + " failed: " + e.getMessage());
            return BatchConversionResultItem.failure(item.outputId(), e.getMessage());
        }
    }

    private String resolvePropertyPlaceholders(String htmlString, Debiteur debiteur) {
        if (htmlString == null || htmlString.isEmpty() || debiteur == null) return htmlString;
        // Collect bean properties via reflection once per call (Debiteur is small)
        try {
            // Build a simple map of property name -> value string
            java.util.Map<String,String> values = new java.util.HashMap<>();
            for (java.lang.reflect.Method m : Debiteur.class.getMethods()) {
                if ((m.getName().startsWith("get") || m.getName().startsWith("is")) && m.getParameterCount()==0 && !m.getName().equals("getClass")) {
                    Object v = null;
                    try { v = m.invoke(debiteur); } catch (Exception ignore) { }
                    if (v != null) {
                        String propName = m.getName().startsWith("get") ? m.getName().substring(3) : m.getName().substring(2);
                        if (!propName.isEmpty()) {
                            // lowerCamelCase first letter
                            propName = Character.toLowerCase(propName.charAt(0)) + propName.substring(1);
                            values.put(propName, v.toString());
                        }
                    }
                }
            }
            if (values.isEmpty()) return htmlString;
            // Fast scan replacing ${...}
            StringBuilder out = new StringBuilder(htmlString.length());
            int i=0; int len=htmlString.length();
            while (i < len) {
                int start = htmlString.indexOf("${", i);
                if (start < 0) { out.append(htmlString, i, len); break; }
                int end = htmlString.indexOf('}', start+2);
                if (end < 0) { out.append(htmlString, i, len); break; }
                out.append(htmlString, i, start); // append text before placeholder
                String key = htmlString.substring(start+2, end).trim();
                String val = values.get(key);
                out.append(val != null ? val : "");
                i = end + 1;
            }
            return out.toString();
        } catch (Exception e) {
            log.warn("resolvePropertyPlaceholders failed: {}", e.getMessage());
            return htmlString;
        }
    }

    @ExceptionHandler(HtmlToPdfConversionException.class)
    public ResponseEntity<String> handleConversionException(HtmlToPdfConversionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.TEXT_PLAIN)
                .header(HttpHeaders.CONTENT_ENCODING, StandardCharsets.UTF_8.name())
                .body(ex.getMessage());
    }
}
