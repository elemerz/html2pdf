package nl.infomedics.invoicing.model;

import jakarta.validation.constraints.NotBlank;

public record BatchConversionItem(
    String jsonModel,
    @NotBlank String outputId
) {}
