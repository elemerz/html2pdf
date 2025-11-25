package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class PublishTemplateRequest {
    private int invoiceType;
    private String xhtmlTemplate;
    private String version;
}
