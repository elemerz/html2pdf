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
import nl.infomedics.invoicing.model.DebiteurWithPractitioner;

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
    
    private DebiteurWithPractitioner parseDebiteur(String jsonModel) throws Exception {
        if (jsonModel == null || jsonModel.isBlank()) return new DebiteurWithPractitioner();
        JsonNode root = OBJECT_MAPPER.readTree(jsonModel);
        if (root.isObject() && root.has("debiteur") && root.get("debiteur").isObject()) {
            root = root.get("debiteur");
        }
        return OBJECT_MAPPER.treeToValue(root, DebiteurWithPractitioner.class);
    }

    private BatchConversionResultItem convertSingleItem(String sharedHtml, boolean includeSanitised, BatchConversionItem item) {
        try {
            DebiteurWithPractitioner dwp = null;
            try {
                dwp = parseDebiteur(item.jsonModel());
            } catch (Exception parseEx) {
                log.warn("Failed to parse debiteur model for {}: {}", item.outputId(), parseEx.getMessage());
            }
            String htmlResolved = dwp != null ? resolvePropertyPlaceholders(sharedHtml, dwp) : sharedHtml;
//            log.info("\n\nsharedHtml =\n\n {}", sharedHtml);
//            log.info("\n\nhtmlResolved =\n\n {}", htmlResolved);
            PdfConversionResult result = converterService.convertHtmlToPdf(htmlResolved);
            String pdfBase64 = Base64.getEncoder().encodeToString(result.pdfContent());
            String sanitised = includeSanitised ? result.sanitisedXhtml() : null;
            return BatchConversionResultItem.success(item.outputId(), pdfBase64, sanitised);
        } catch (Exception e) {
            log.error("Batch item {} failed: {}", item.outputId(), e.getMessage());
            return BatchConversionResultItem.failure(item.outputId(), e.getMessage());
        }
    }

    private String resolvePropertyPlaceholders(String htmlString, DebiteurWithPractitioner debiteur) {
        if (htmlString == null || htmlString.isEmpty() || debiteur == null) return htmlString;
        // Extended placeholder resolution: supports ${a.b.c} and simple repeat nodes:
        // <tr data-repeat-over="collectionName" data-repeat-var="itemVar"> ... ${itemVar.prop} ... </tr>
        try {
            java.util.Map<String,String> cache = new java.util.HashMap<>(); // cache computed values per key
            java.util.function.BiFunction<Object,String,Object> readProp = (obj, name) -> {
                if (obj == null || name == null || name.isEmpty()) return null;
                Class<?> c = obj.getClass();
                String capital = Character.toUpperCase(name.charAt(0)) + name.substring(1);
                try { java.lang.reflect.Method m = c.getMethod("get" + capital); return m.invoke(obj); } catch (Exception ignored) {}
                try { java.lang.reflect.Method m = c.getMethod("is" + capital); return m.invoke(obj); } catch (Exception ignored) {}
                try { java.lang.reflect.Method m = c.getMethod(name); if (m.getParameterCount()==0) return m.invoke(obj); } catch (Exception ignored) {}
                return null;
            };
            java.util.function.BiFunction<Object,String,Object> resolvePath = (root, path) -> {
                if (root == null || path == null || path.isEmpty()) return null;
                Object current = root;
                for (String part : path.split("\\.")) {
                    if (current == null) return null;
                    current = readProp.apply(current, part);
                }
                return current;
            };
            // 1. Handle repeat nodes (very lightweight parser; assumes attributes on same opening tag line)
            // Pattern for a repeatable TR (can generalize later): find tags with both data-repeat-over and data-repeat-var
            String repeatPattern = "(<([a-zA-Z0-9]+)([^>]*?data-repeat-over=\\\"([a-zA-Z0-9_\\.]+)\\\"[^>]*?data-repeat-var=\\\"([a-zA-Z0-9_]+)\\\"[^>]*?)>)([\\s\\S]*?)(</\\2>)"; // group 4: collection path, 5: var name, 6: inner html
            java.util.regex.Pattern rp = java.util.regex.Pattern.compile(repeatPattern);
            java.util.regex.Matcher rm = rp.matcher(htmlString);
            StringBuffer sbRepeat = new StringBuffer();
            while (rm.find()) {
                String openingTag = rm.group(1);
                String collectionPath = rm.group(4);
                String varName = rm.group(5);
                String inner = rm.group(6);
                Object collectionObj = resolvePath.apply(debiteur, collectionPath);
                StringBuilder repeated = new StringBuilder();
                if (collectionObj instanceof java.lang.Iterable<?> iterable) {
                    for (Object item : iterable) {
                        // For each item, resolve ${varName.x.y} within inner HTML.
                        String resolvedInner = resolveItemPlaceholders(inner, varName, item, resolvePath);
                        repeated.append(openingTag.replace("data-repeat-over=\""+collectionPath+"\"", "")
                                .replace("data-repeat-var=\""+varName+"\"", "")) // strip repeat attributes
                                .append(resolvedInner)
                                .append("</"+rm.group(2)+">");
                    }
                } else if (collectionObj != null && collectionObj.getClass().isArray()) {
                    int length = java.lang.reflect.Array.getLength(collectionObj);
                    for (int idx=0; idx<length; idx++) {
                        Object item = java.lang.reflect.Array.get(collectionObj, idx);
                        String resolvedInner = resolveItemPlaceholders(inner, varName, item, resolvePath);
                        repeated.append(openingTag.replace("data-repeat-over=\""+collectionPath+"\"", "")
                                .replace("data-repeat-var=\""+varName+"\"", ""))
                                .append(resolvedInner)
                                .append("</"+rm.group(2)+">");
                    }
                }
                if (repeated.length() == 0) {
                    // No collection or empty -> remove entire block
                    rm.appendReplacement(sbRepeat, java.util.regex.Matcher.quoteReplacement(""));
                } else {
                    rm.appendReplacement(sbRepeat, java.util.regex.Matcher.quoteReplacement(repeated.toString()));
                }
            }
            rm.appendTail(sbRepeat);
            String afterRepeatExpansion = sbRepeat.toString();

            // 2. Resolve remaining ${...} placeholders against root debiteur
            StringBuilder out = new StringBuilder(afterRepeatExpansion.length());
            int i=0; int len=afterRepeatExpansion.length();
            while (i < len) {
                int start = afterRepeatExpansion.indexOf("${", i);
                if (start < 0) { out.append(afterRepeatExpansion, i, len); break; }
                int end = afterRepeatExpansion.indexOf('}', start+2);
                if (end < 0) { out.append(afterRepeatExpansion, i, len); break; }
                out.append(afterRepeatExpansion, i, start);
                String key = afterRepeatExpansion.substring(start+2, end).trim();
                String val = cache.get(key);
                if (val == null && !cache.containsKey(key)) {
                    Object resolved = resolvePath.apply(debiteur, key);
                    val = resolved != null ? resolved.toString() : "";
                    cache.put(key, val);
                }
                out.append(val != null ? val : "");
                i = end + 1;
            }
            return out.toString();
        } catch (Exception e) {
            log.warn("resolvePropertyPlaceholders failed: {}", e.getMessage());
            return htmlString;
        }
    }

    // Resolves ${var.prop.path} within an inner repeat section for a single item object.
    private String resolveItemPlaceholders(String inner, String varName, Object item, java.util.function.BiFunction<Object,String,Object> resolvePath) {
        if (inner == null || inner.isEmpty()) return inner;
        StringBuilder out = new StringBuilder(inner.length());
        int i=0; int len=inner.length();
        while (i < len) {
            int start = inner.indexOf("${", i);
            if (start < 0) { out.append(inner, i, len); break; }
            int end = inner.indexOf('}', start+2);
            if (end < 0) { out.append(inner, i, len); break; }
            out.append(inner, i, start);
            String key = inner.substring(start+2, end).trim();
            if (key.startsWith(varName + ".")) {
                String path = key.substring(varName.length()+1);
                Object resolved = resolvePath.apply(item, path);
                out.append(resolved != null ? resolved.toString() : "");
            } else {
                // leave unresolved for later global pass
                out.append("${"+key+"}");
            }
            i = end + 1;
        }
        return out.toString();
    }

    @ExceptionHandler(HtmlToPdfConversionException.class)
    public ResponseEntity<String> handleConversionException(HtmlToPdfConversionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.TEXT_PLAIN)
                .header(HttpHeaders.CONTENT_ENCODING, StandardCharsets.UTF_8.name())
                .body(ex.getMessage());
    }
}
