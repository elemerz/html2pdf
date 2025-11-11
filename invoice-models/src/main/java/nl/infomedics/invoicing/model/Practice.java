package nl.infomedics.invoicing.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
public class Practice {
    private String name;
    private String code;
    private String phone;
    // helper to normalize nulls to empty strings
    public void normalize() {
        if (name==null) name="";
        if (code==null) code="";
        if (phone==null) phone="";
    }
}
