package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Practitioner {
    private String practiceName;
    private String practiceCity;
    private String imageUrl; // optional logo/image if present
}
