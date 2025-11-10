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

/**
 * REST controller exposing HTML-to-PDF conversion endpoints.
 */
@RestController
@RequestMapping(path = "/api/v1/pdf")
@Validated
public class HtmlToPdfController {

    private final Html2PdfConverterService converterService;

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
        System.out.println(">>> Received conversion request - HTML size: " + requestSize + " bytes (" + (requestSize/1024) + " KB)");
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
        System.out.println(">>> Received conversion-with-model request - HTML size: " + requestSize + " bytes (" + (requestSize/1024) + " KB)" +
                ", JSON size: " + (request.jsonModel()!=null?request.jsonModel().length():0));
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
        System.out.println(">>> Received batch conversion request with " + request.items().size() + " items, shared HTML size=" + (request.html()!=null?request.html().length():0));
        
        List<CompletableFuture<BatchConversionResultItem>> futures = request.items().stream()
                .map(item -> CompletableFuture.supplyAsync(() -> convertSingleItem(request.html(), request.includeSanitisedXhtml(), item)))
                .collect(Collectors.toList());
        
        List<BatchConversionResultItem> results = futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList());
        
        BatchConversionResponse response = new BatchConversionResponse(results, Instant.now());
        return ResponseEntity.ok(response);
    }
    
    private BatchConversionResultItem convertSingleItem(String sharedHtml, boolean includeSanitised, BatchConversionItem item) {
        try {
            PdfConversionResult result = converterService.convertHtmlToPdf(sharedHtml);
            String pdfBase64 = Base64.getEncoder().encodeToString(result.pdfContent());
            String sanitised = includeSanitised ? result.sanitisedXhtml() : null;
            return BatchConversionResultItem.success(item.outputId(), pdfBase64, sanitised);
        } catch (Exception e) {
            System.err.println("Batch item " + item.outputId() + " failed: " + e.getMessage());
            return BatchConversionResultItem.failure(item.outputId(), e.getMessage());
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
