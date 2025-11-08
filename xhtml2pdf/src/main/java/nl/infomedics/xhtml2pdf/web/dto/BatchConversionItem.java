package nl.infomedics.xhtml2pdf.web.dto;

import jakarta.validation.constraints.NotBlank;

public record BatchConversionItem(
    @NotBlank String html,
    String jsonModel,
    @NotBlank String outputId,
    boolean includeSanitisedXhtml
) {
    public BatchConversionItem(String html, String jsonModel, String outputId) {
        this(html, jsonModel, outputId, false);
    }
}
