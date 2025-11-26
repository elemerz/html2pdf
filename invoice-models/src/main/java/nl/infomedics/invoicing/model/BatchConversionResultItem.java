package nl.infomedics.invoicing.model;

public record BatchConversionResultItem(
	    String outputId,
	    byte[] pdfContent,
	    String error
	) {
	    public static BatchConversionResultItem success(String outputId, byte[] pdfContent) {
	        return new BatchConversionResultItem(outputId, pdfContent, null);
	    }
	    
	    public static BatchConversionResultItem failure(String outputId, String error) {
	        return new BatchConversionResultItem(outputId, null, error);
	    }
	}
