package nl.infomedics.invoicing.model;

import java.time.LocalDate;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Specificatie {
	private String insuredId; // join key
	private LocalDate date;
	private String toothOrJaw; // e.g., "Bovenkaak C90"
	private String description; // full Dutch description
	private String tariffCode; // 1099 / 6723 etc
	private String reference; // optional reference code
	private Integer amountCents; // fallback if present; adapt if amount is formatted elsewhere
}
