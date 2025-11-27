package nl.infomedics.invoicing.model;

import jakarta.validation.constraints.NotBlank;

public record BatchConversionItem(
    Object jsonModel,
    @NotBlank String outputId
) {}
