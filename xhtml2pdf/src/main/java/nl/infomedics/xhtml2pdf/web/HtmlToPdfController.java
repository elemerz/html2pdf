package nl.infomedics.xhtml2pdf.web;

import jakarta.validation.Valid;
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

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import nl.infomedics.xhtml2pdf.web.dto.HtmlToPdfRequest;
import nl.infomedics.xhtml2pdf.web.dto.HtmlToPdfResponse;
import nl.infomedics.reporting.service.Html2PdfConverterService;
import nl.infomedics.reporting.service.Html2PdfConverterService.HtmlToPdfConversionException;
import nl.infomedics.reporting.service.Html2PdfConverterService.PdfConversionResult;

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

    @ExceptionHandler(HtmlToPdfConversionException.class)
    public ResponseEntity<String> handleConversionException(HtmlToPdfConversionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.TEXT_PLAIN)
                .header(HttpHeaders.CONTENT_ENCODING, StandardCharsets.UTF_8.name())
                .body(ex.getMessage());
    }
}
