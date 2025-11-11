package nl.infomedics.invoicing.model;

import java.math.BigDecimal;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class DebiteurWithPractitioner {
    private Debiteur debiteur = new Debiteur(); // ensure non-null
    private Practitioner practitioner = new Practitioner(); // ensure non-null
    private List<Specificatie> treatments; // may stay null until set
    private BigDecimal totaalBedrag;
}
