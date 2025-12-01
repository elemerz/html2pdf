package nl.infomedics.xhtml2pdf.web;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import nl.infomedics.invoicing.model.BatchConversionItem;
import nl.infomedics.invoicing.model.BatchConversionRequest;
import nl.infomedics.invoicing.model.BatchConversionResponse;
import nl.infomedics.invoicing.model.BatchConversionResultItem;
import nl.infomedics.invoicing.model.DebiteurWithPractitioner;
import nl.infomedics.reporting.service.Html2PdfConverterService;
import nl.infomedics.reporting.service.Html2PdfConverterService.HtmlToPdfConversionException;
import nl.infomedics.reporting.service.Html2PdfConverterService.PdfConversionResult;

/**
 * REST controller exposing HTML-to-PDF conversion endpoints.
 */
@RestController
@RequestMapping(path = "/api/v1/pdf")
@Validated
@Slf4j
public class HtmlToPdfController {

    private final Html2PdfConverterService converterService;
    private final ExecutorService pdfConversionExecutor;
    private static final java.util.Map<String, RepeatPlan> REPEAT_PLAN_CACHE = new java.util.concurrent.ConcurrentHashMap<>();
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final java.util.regex.Pattern REPEAT_BLOCK_PATTERN = java.util.regex.Pattern.compile(
            "(<([a-zA-Z0-9]+)([^>]*?data-repeat-over=\\\"([a-zA-Z0-9_\\.]+)\\\"[^>]*?data-repeat-var=\\\"([a-zA-Z0-9_]+)\\\"[^>]*?)>)([\\s\\S]*?)(</\\2>)"
    );

    private static final java.util.Map<String, java.lang.reflect.Method> METHOD_CACHE = new java.util.concurrent.ConcurrentHashMap<>();

    public HtmlToPdfController(Html2PdfConverterService converterService,
                               @Qualifier("pdfConversionExecutor") ExecutorService pdfConversionExecutor) {
        this.converterService = converterService;
        this.pdfConversionExecutor = pdfConversionExecutor;
    }

    @PostMapping(
            path = "/convert-batch",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<BatchConversionResponse> convertBatch(@Valid @RequestBody BatchConversionRequest request) {
        // debug: batch conversion items=" + request.items().size()
        
        int maxInFlight = determineMaxInFlight(pdfConversionExecutor);
        java.util.concurrent.Semaphore limiter = new java.util.concurrent.Semaphore(maxInFlight);

        List<CompletableFuture<BatchConversionResultItem>> futures = request.items().stream()
                .map(item -> CompletableFuture.supplyAsync(() -> {
                            try {
                                limiter.acquire();
                                return convertSingleItem(request.html(), request.includeSanitisedXhtml(), item);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                                return BatchConversionResultItem.failure(item.outputId(), "Interrupted");
                            } finally {
                                limiter.release();
                            }
                        }, pdfConversionExecutor))
                .collect(Collectors.toList());
        
        List<BatchConversionResultItem> results = futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList());
        
        BatchConversionResponse response = new BatchConversionResponse(results, Instant.now());
        return ResponseEntity.ok(response);
    }
    
    private DebiteurWithPractitioner parseDebiteur(Object jsonModel) throws Exception {
        if (jsonModel == null) return new DebiteurWithPractitioner();
        if (jsonModel instanceof DebiteurWithPractitioner direct) {
            return direct;
        }
        if (jsonModel instanceof nl.infomedics.invoicing.model.SingleDebtorInvoice sdi
                && sdi.getDebiteur() != null) {
            return sdi.getDebiteur();
        }

        JsonNode root;
        if (jsonModel instanceof String s) {
            if (s.isBlank()) return new DebiteurWithPractitioner();
            root = OBJECT_MAPPER.readTree(s);
        } else {
            root = OBJECT_MAPPER.valueToTree(jsonModel);
        }

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
            PdfConversionResult result = converterService.convertHtmlToPdf(htmlResolved, includeSanitised);
            byte[] pdfBytes = result.pdfContent();
            return BatchConversionResultItem.success(item.outputId(), pdfBytes);
        } catch (Exception e) {
            log.error("Batch item {} failed: {}", item.outputId(), e.getMessage());
            return BatchConversionResultItem.failure(item.outputId(), e.getMessage());
        }
    }

    private String resolvePropertyPlaceholders(String htmlString, DebiteurWithPractitioner debiteur) {
        if (htmlString == null || htmlString.isEmpty() || debiteur == null) return htmlString;
        RepeatPlan plan = REPEAT_PLAN_CACHE.computeIfAbsent(htmlString, this::compileRepeatPlan);
        if (!plan.hasRepeat && !plan.hasPlaceholders) return htmlString;

        try {
            java.util.function.BiFunction<Object,String,Object> resolvePath = (root, path) -> {
                if (root == null || path == null || path.isEmpty()) return null;
                Object current = root;
                for (String part : path.split("\\.")) {
                    if (current == null) return null;
                    if (current instanceof java.util.Map<?,?> m && m.containsKey(part)) {
                        current = m.get(part);
                    } else {
                        current = invokeProperty(current, part);
                    }
                }
                return current;
            };
            
            return executePlan(plan, debiteur, resolvePath);
        } catch (Exception e) {
            log.warn("resolvePropertyPlaceholders failed: {}", e.getMessage());
            return htmlString;
        }
    }

    private String executePlan(RepeatPlan plan, Object debiteurMap,
                               java.util.function.BiFunction<Object,String,Object> resolvePath) {
        StringBuilder out = new StringBuilder();
        
        java.util.function.Function<String, String> globalResolver = key -> {
             Object val = resolvePath.apply(debiteurMap, key);
             return val != null ? val.toString() : "";
        };

        if (!plan.hasRepeat) {
            resolveParsed(plan.tail, out, globalResolver);
            return out.toString();
        }

        for (RepeatSegment seg : plan.segments) {
            resolveParsed(seg.prefix, out, globalResolver);
            
            Object collectionObj = resolvePath.apply(debiteurMap, seg.collectionPath);
            if (collectionObj instanceof java.lang.Iterable<?> iterable) {
                for (Object item : iterable) {
                    processInner(seg, item, out, resolvePath, globalResolver);
                }
            } else if (collectionObj != null && collectionObj.getClass().isArray()) {
                int length = java.lang.reflect.Array.getLength(collectionObj);
                for (int idx = 0; idx < length; idx++) {
                    Object item = java.lang.reflect.Array.get(collectionObj, idx);
                    processInner(seg, item, out, resolvePath, globalResolver);
                }
            }
        }
        resolveParsed(plan.tail, out, globalResolver);
        return out.toString();
    }

    private void processInner(RepeatSegment seg, Object item, StringBuilder out, 
                              java.util.function.BiFunction<Object,String,Object> resolvePath,
                              java.util.function.Function<String, String> globalResolver) {
        out.append(seg.openingTagStripped);
        for (Token t : seg.inner.tokens) {
            if (!t.isPlaceholder) {
                out.append(t.content);
            } else {
                String key = t.content;
                String val;
                if (key.startsWith(seg.varName + ".")) {
                    String path = key.substring(seg.varName.length() + 1);
                    Object obj = resolvePath.apply(item, path);
                    val = obj != null ? obj.toString() : "";
                } else {
                    val = globalResolver.apply(key);
                }
                
                if (val != null) {
                    out.append(val);
                } else {
                    out.append("${").append(key).append("}");
                }
            }
        }
        out.append(seg.closingTag);
    }

    private void resolveParsed(ParsedString ps, StringBuilder out, java.util.function.Function<String, String> resolver) {
        for (Token t : ps.tokens) {
            if (!t.isPlaceholder) {
                out.append(t.content);
            } else {
                String val = resolver.apply(t.content);
                if (val != null) {
                    out.append(val);
                } else {
                    out.append("${").append(t.content).append("}");
                }
            }
        }
    }

    private ParsedString parseString(String input) {
        if (input == null || input.isEmpty()) return new ParsedString(java.util.Collections.emptyList());
        java.util.List<Token> tokens = new java.util.ArrayList<>();
        int i = 0; int len = input.length();
        while (i < len) {
            int start = input.indexOf("${", i);
            if (start < 0) {
                tokens.add(new Token(false, input.substring(i)));
                break;
            }
            if (start > i) {
                tokens.add(new Token(false, input.substring(i, start)));
            }
            int end = input.indexOf('}', start + 2);
            if (end < 0) {
                tokens.add(new Token(false, input.substring(start)));
                break;
            }
            tokens.add(new Token(true, input.substring(start + 2, end).trim()));
            i = end + 1;
        }
        return new ParsedString(tokens);
    }

    private Object invokeProperty(Object obj, String name) {
        if (obj == null || name == null || name.isEmpty()) return null;
        Class<?> c = obj.getClass();
        String capital = Character.toUpperCase(name.charAt(0)) + name.substring(1);
        String keyGet = c.getName()+"#get"+capital;
        String keyIs = c.getName()+"#is"+capital;
        String keyPlain = c.getName()+"#"+name;
        try {
            java.lang.reflect.Method m = METHOD_CACHE.get(keyGet);
            if (m == null) { m = c.getMethod("get" + capital); METHOD_CACHE.put(keyGet, m); }
            return m.invoke(obj);
        } catch (Exception ignored) {}
        try {
            java.lang.reflect.Method m = METHOD_CACHE.get(keyIs);
            if (m == null) { m = c.getMethod("is" + capital); METHOD_CACHE.put(keyIs, m); }
            return m.invoke(obj);
        } catch (Exception ignored) {}
        try {
            java.lang.reflect.Method m = METHOD_CACHE.get(keyPlain);
            if (m == null) { m = c.getMethod(name); METHOD_CACHE.put(keyPlain, m); }
            if (m.getParameterCount()==0) return m.invoke(obj);
        } catch (Exception ignored) {}
        return null;
    }

    private RepeatPlan compileRepeatPlan(String html) {
        boolean hasRepeat = html.contains("data-repeat-over");
        boolean hasPlaceholders = html.contains("${");
        if (!hasRepeat) {
            return new RepeatPlan(hasRepeat, hasPlaceholders, java.util.Collections.emptyList(), parseString(html));
        }
        java.util.List<RepeatSegment> segments = new java.util.ArrayList<>();
        java.util.regex.Matcher rm = REPEAT_BLOCK_PATTERN.matcher(html);
        int last = 0;
        while (rm.find()) {
            String prefix = html.substring(last, rm.start());
            String openingTag = rm.group(1);
            String collectionPath = rm.group(4);
            String varName = rm.group(5);
            String inner = rm.group(6);
            String closingTag = "</" + rm.group(2) + ">";
            String strippedOpening = openingTag
                    .replace("data-repeat-over=\"" + collectionPath + "\"", "")
                    .replace("data-repeat-var=\"" + varName + "\"", "");
            segments.add(new RepeatSegment(parseString(prefix), strippedOpening, closingTag, collectionPath, varName, parseString(inner)));
            last = rm.end();
        }
        String tail = html.substring(last);
        return new RepeatPlan(true, hasPlaceholders, java.util.Collections.unmodifiableList(segments), parseString(tail));
    }


    
    // Wait, if I want to resolve global placeholders inside the loop, I need access to debiteurMap.
    // The original code left them as `${key}` and then the global pass resolved them.
    // If I want to do it in one pass, I must resolve them now.
    
    // So `processInner` needs `debiteurMap`.
    
    // Let's refine `expandRepeats` replacement.
    


    private record Token(boolean isPlaceholder, String content) {}
    private record ParsedString(java.util.List<Token> tokens) {}

    private record RepeatPlan(boolean hasRepeat, boolean hasPlaceholders,
                              java.util.List<RepeatSegment> segments, ParsedString tail) { }

    private record RepeatSegment(ParsedString prefix, String openingTagStripped, String closingTag,
                                 String collectionPath, String varName, ParsedString inner) { }

    private int determineMaxInFlight(ExecutorService executor) {
        if (executor instanceof java.util.concurrent.ThreadPoolExecutor tpe) {
            int max = tpe.getMaximumPoolSize();
            return Math.max(1, max * 2); // allow small queueing but prevent floods
        }
        return Math.max(1, Runtime.getRuntime().availableProcessors());
    }

    @ExceptionHandler(HtmlToPdfConversionException.class)
    public ResponseEntity<String> handleConversionException(HtmlToPdfConversionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.TEXT_PLAIN)
                .header(HttpHeaders.CONTENT_ENCODING, StandardCharsets.UTF_8.name())
                .body(ex.getMessage());
    }
}
