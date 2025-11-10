package nl.infomedics.invoicing.service;

import java.util.List;

public record TemplateBatch(String html, List<Xhtml2PdfClient.BatchItem> items) {}
