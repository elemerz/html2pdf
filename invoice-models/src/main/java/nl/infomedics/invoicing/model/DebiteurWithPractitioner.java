package nl.infomedics.invoicing.model;

import java.math.BigDecimal;
import java.util.List;
import java.time.LocalDate;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class DebiteurWithPractitioner {
    // Debiteur fields
    private String invoiceNumber;
    private String practiceName;
    private String practiceCity;
    private String insuredId; // join key
    private String patientName;
    private LocalDate patientDob;
    private String insurer;
    private LocalDate periodFrom;
    private LocalDate periodTo;
    private Integer invoiceType; // internal only, not sent further to xhtml2pdf
    private List<Integer> totals; // raw total fields from source
    private String imageUrl;
    private List<Specificatie> treatments;

    // Practitioner fields (duplicated per debtor for self-contained invoice model)
    private String practitionerName;
    private String practitionerAgbCode;
    private String practitionerPracticeCode;
    private Integer practitionerLogoNr;
    private String practitionerCountry;
    private String practitionerPostcode;
    private String practitionerStreet;
    private String practitionerHouseNr;
    private String practitionerPhone;

    // Elevated total amount from MetaInfo (replicated per invoice)
    private BigDecimal totaalBedrag;
}
