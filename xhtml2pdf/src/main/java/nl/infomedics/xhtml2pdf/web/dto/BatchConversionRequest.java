package nl.infomedics.xhtml2pdf.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record BatchConversionRequest(
    @NotEmpty @Valid List<BatchConversionItem> items
) {}
