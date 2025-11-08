package nl.infomedics.xhtml2pdf.web.dto;

public record BatchConversionResultItem(
    String outputId,
    String pdfBase64,
    String sanitisedXhtml,
    String error
) {
    public static BatchConversionResultItem success(String outputId, String pdfBase64, String sanitisedXhtml) {
        return new BatchConversionResultItem(outputId, pdfBase64, sanitisedXhtml, null);
    }
    
    public static BatchConversionResultItem failure(String outputId, String error) {
        return new BatchConversionResultItem(outputId, null, null, error);
    }
}
