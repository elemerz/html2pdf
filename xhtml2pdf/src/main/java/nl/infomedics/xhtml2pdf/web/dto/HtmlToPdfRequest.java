package nl.infomedics.xhtml2pdf.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request payload for HTML-to-PDF conversion.
 *
 * @param html XHTML/HTML string to convert.
 * @param includeSanitisedXhtml flag indicating whether the sanitised XHTML snapshot should be returned.
 */
public record HtmlToPdfRequest(
        @NotBlank(message = "html must not be blank")
        @Size(max = 5_000_000, message = "html must be at most 5MB")
        String html,
        boolean includeSanitisedXhtml) {
}
