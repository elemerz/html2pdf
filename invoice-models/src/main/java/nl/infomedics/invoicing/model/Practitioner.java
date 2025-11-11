package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Practitioner {
	private String agbCode;
    private Integer logoNr; // numeric logo reference
    private Address address = new Address(); // ensure never null
    private Practice practice = new Practice(); // ensure never null
    // helper to normalize nulls to empty strings
    public void normalize() {
        if (agbCode==null) agbCode="";
        if (logoNr==null) logoNr=0;
        if (address==null) address = new Address();
        if (practice==null) practice = new Practice();
        address.normalize();
        practice.normalize();
    }
}
