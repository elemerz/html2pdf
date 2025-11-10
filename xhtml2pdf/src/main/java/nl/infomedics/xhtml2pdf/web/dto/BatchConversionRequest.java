package nl.infomedics.xhtml2pdf.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record BatchConversionRequest(
    @NotBlank String html,
    boolean includeSanitisedXhtml,
    @NotEmpty @Valid List<BatchConversionItem> items
) {}
