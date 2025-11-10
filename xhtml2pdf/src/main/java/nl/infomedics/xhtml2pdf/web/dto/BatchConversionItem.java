package nl.infomedics.xhtml2pdf.web.dto;

import jakarta.validation.constraints.NotBlank;

public record BatchConversionItem(
    String jsonModel,
    @NotBlank String outputId
) {}
