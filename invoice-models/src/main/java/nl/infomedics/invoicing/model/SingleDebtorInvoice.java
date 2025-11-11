package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class SingleDebtorInvoice {
    private DebiteurWithPractitioner debiteur; // flattened self-contained invoice
}
