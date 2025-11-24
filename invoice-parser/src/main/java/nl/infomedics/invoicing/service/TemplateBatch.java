package nl.infomedics.invoicing.service;

import java.util.List;

import nl.infomedics.invoicing.model.BatchConversionItem;

public record TemplateBatch(String html, List<BatchConversionItem> items) {}
