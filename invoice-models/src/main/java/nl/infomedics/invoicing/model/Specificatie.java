package nl.infomedics.invoicing.model;

import java.time.LocalDate;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Specificatie {
	private String invoiceNumber; // join key Excel: 0/A
	private LocalDate date; //Excel: 1/B
	private String treatmentCode; // Excel: 2/C
	private String description; //Excel: 3/D
	private Integer amountCents; // Excel: 4/E
	private String treatmentProvider; //Excel: 5/F
	private String vatIndicator; //Excel: 8/I
	private String vatValueCents; //Excel: 9/J
}
