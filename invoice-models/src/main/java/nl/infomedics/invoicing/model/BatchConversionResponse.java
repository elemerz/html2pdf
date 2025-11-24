package nl.infomedics.invoicing.model;

import java.time.Instant;
import java.util.List;

public record BatchConversionResponse(
	    List<BatchConversionResultItem> results,
	    Instant generatedAt
	) {}
