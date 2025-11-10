package nl.infomedics.invoicing.model;

import java.time.LocalDate;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor @NoArgsConstructor @Getter @Setter
public class Debiteur {
	private String invoiceNumber;
	private String practiceName;
	private String practiceCity;
	private String insuredId; // join key
	private String patientName;
	private LocalDate patientDob;
	private String insurer;
	private LocalDate periodFrom;
	private LocalDate periodTo;
	private Integer invoiceType;
	private List<Integer> totals; // raw total fields from source (optional)
	private String imageUrl;
	private List<Specificatie> treatments; // renamed from specificaties
}
