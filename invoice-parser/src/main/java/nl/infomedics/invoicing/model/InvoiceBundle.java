package nl.infomedics.invoicing.model;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class InvoiceBundle {
	private List<DebiteurWithPractitioner> debiteuren; // self-contained invoices
}
