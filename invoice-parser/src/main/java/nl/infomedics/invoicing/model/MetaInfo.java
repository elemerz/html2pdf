package nl.infomedics.invoicing.model;

import java.math.BigDecimal;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class MetaInfo {
    // Internal only: template selection + total amount (elevated elsewhere)
    private Integer invoiceType; // e.g., 27
    private BigDecimal totaalBedrag; // e.g., 387.88
}
