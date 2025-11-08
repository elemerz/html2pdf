package nl.infomedics.xhtml2pdf.web.dto;

import java.time.Instant;
import java.util.List;

public record BatchConversionResponse(
    List<BatchConversionResultItem> results,
    Instant generatedAt
) {}
