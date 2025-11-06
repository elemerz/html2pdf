package nl.infomedics.invoicing.model;

import java.math.BigDecimal;
import java.util.Map;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class MetaInfo {
	private Map<Integer, Integer> invoiceTypeCounts; // e.g., {20=4}
	private BigDecimal totaalBedrag; // optional aggregate from meta
}
