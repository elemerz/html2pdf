package nl.infomedics.invoicing.model;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response payload for HTML-to-PDF conversions.
 *
 * @param pdfContent Raw PDF bytes.
 * @param generatedAt Timestamp indicating when the PDF was produced.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record HtmlToPdfResponse(
        byte[] pdfContent,
        Instant generatedAt) {
}
