package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Address {
    private String country;
    private String city;
    private String postcode;
    private String street;
    private String houseNr;
    // helper to normalize nulls to empty strings
    public void normalize() {
        if (country==null) country="";
        if (city==null) city="";
        if (postcode==null) postcode="";
        if (street==null) street="";
        if (houseNr==null) houseNr="";
    }
}
