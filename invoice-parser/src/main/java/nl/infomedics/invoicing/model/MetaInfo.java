package nl.infomedics.invoicing.model;

import java.math.BigDecimal;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class MetaInfo {
    // Slimmed down meta info: only the single relevant invoiceType (count > 0)
    private Integer invoiceType; // e.g., 27
    private Integer invoiceCount; // e.g., 6
    private BigDecimal totaalBedrag; // e.g., 387.88
}
