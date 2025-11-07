package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Practitioner {
    private String practiceName;
    private String agbCode;
    private String practiceCode;
    private Integer logoNr; // numeric logo reference
    private String practiceCountry;
    private String practiceCity;
    private String practicePostcode;
    private String practiceStreet;
    private String practiceHouseNr;
    private String practicePhone;
    // helper to normalize nulls to empty strings
    public void normalize() {
        if (practiceName==null) practiceName="";
        if (agbCode==null) agbCode="";
        if (practiceCode==null) practiceCode="";
        if (practiceCountry==null) practiceCountry="";
        if (practiceCity==null) practiceCity="";
        if (practicePostcode==null) practicePostcode="";
        if (practiceStreet==null) practiceStreet="";
        if (practiceHouseNr==null) practiceHouseNr="";
        if (practicePhone==null) practicePhone="";
        if (logoNr==null) logoNr=0;
    }
}
