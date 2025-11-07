package nl.infomedics.xhtml2pdf.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Extended request including the original XHTML plus a JSON data model.
 * For now the server ignores the JSON model (reserved for future template rendering).
 */
public record HtmlToPdfWithModelRequest(
        @NotBlank(message = "html must not be blank")
        @Size(max = 5_000_000, message = "html must be at most 5MB")
        String html,
        @NotBlank(message = "jsonModel must not be blank")
        @Size(max = 5_000_000, message = "jsonModel must be at most 5MB")
        String jsonModel,
        boolean includeSanitisedXhtml) { }
