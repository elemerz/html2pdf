package nl.infomedics.invoicing.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response payload for HTML-to-PDF conversions.
 *
 * @param pdfBase64 Base64-encoded PDF document.
 * @param sanitisedXhtml Optional sanitised XHTML snapshot (present when requested).
 * @param generatedAt Timestamp indicating when the PDF was produced.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record HtmlToPdfResponse(
        String pdfBase64,
        String sanitisedXhtml,
        Instant generatedAt) {
}
