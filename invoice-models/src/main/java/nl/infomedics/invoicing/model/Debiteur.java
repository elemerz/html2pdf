package nl.infomedics.invoicing.model;

import java.time.LocalDate;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor @NoArgsConstructor @Getter @Setter
public class Debiteur {
	private String invoiceNumber;//Excel: 6/G
	private String printDate;//Excel: 16/Q
	private String hcpName; //Excel: 1/B
	private String hcpStreet; //Excel: 2/C
	private String hcpHouseNr; //Excel: 3/D
	private String hcpZipCode; //Excel: 4/E
	private String hcpCity;//Excel: 5/F
	private String practiceAgb;//Excel: 84/CG
	private String hcpAgb;//Excel: 85/CH
	private String insuredId; // join key
	private String patientName; //Excel:7/H
	private String street; //Excel:12/M
	private String houseNr; //Excel:13/N
	private String zipCode; //Excel:14/O
	private String city; //Excel:15/P
	private int invoiceAmountCents; //Excel: 20/U
	private int openImfCents; //Excel: 22/W
	private LocalDate patientDob; //Excel:8/I
	private String firstExpirationDate; //Excel:17/R
	private String insurer;
	private LocalDate periodFrom;
	private LocalDate periodTo;
	private Integer invoiceType;
	private List<Integer> totals; // raw total fields from source (optional)
	private String imageUrl;
	//private List<Specificatie> treatments; // renamed from specificaties
}
