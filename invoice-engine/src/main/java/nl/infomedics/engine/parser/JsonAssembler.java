package nl.infomedics.engine.parser;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Service;
import nl.infomedics.invoicing.model.*;
import java.util.*;

@Service
public class JsonAssembler {
	private final ObjectMapper om;

	public JsonAssembler() {
		this.om = new ObjectMapper()
		.setDefaultPropertyInclusion(JsonInclude.Value.construct(JsonInclude.Include.NON_NULL, JsonInclude.Include.NON_NULL))
		.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
		.registerModule(new JavaTimeModule());
	}


	public InvoiceBundle assemble(MetaInfo meta, Practitioner practitioner, Map<String, Debiteur> debi, Map<String, List<Specificatie>> specs) {
		List<DebiteurWithPractitioner> list = new ArrayList<>();
		for (Debiteur d : debi.values()) {
			DebiteurWithPractitioner dwp = new DebiteurWithPractitioner();
			
			dwp.setDebiteur(d);
			dwp.setTreatments(specs.get(d.getInvoiceNumber()));
			dwp.setPractitioner(practitioner);
			list.add(dwp);
		}
		return new InvoiceBundle(list);
	}


	public String stringify(InvoiceBundle bundle, boolean pretty) throws JsonProcessingException {
		return pretty ? om.writerWithDefaultPrettyPrinter().writeValueAsString(bundle)
		: om.writeValueAsString(bundle);
	}

	public SingleDebtorInvoice createSingleDebtorInvoice(MetaInfo meta, Practitioner practitioner, Debiteur debiteur, List<Specificatie> specs) {
		DebiteurWithPractitioner w = new DebiteurWithPractitioner();
		w.setDebiteur(debiteur);
		w.setTreatments(specs);
		if (practitioner != null) {
			if (w.getPractitioner()==null) w.setPractitioner(new Practitioner());
			if (w.getPractitioner().getPractice()==null) w.getPractitioner().setPractice(new Practice());
			if (w.getPractitioner().getAddress()==null) w.getPractitioner().setAddress(new Address());
			w.getPractitioner().setAgbCode(practitioner.getAgbCode());
			w.getPractitioner().setLogoNr(practitioner.getLogoNr());
			w.getPractitioner().getPractice().setName(practitioner.getPractice().getName());
			w.getPractitioner().getPractice().setCode(practitioner.getPractice().getCode());
			w.getPractitioner().getPractice().setPhone(practitioner.getPractice().getPhone());
			w.getPractitioner().getAddress().setCountry(practitioner.getAddress().getCountry());
			w.getPractitioner().getAddress().setPostcode(practitioner.getAddress().getPostcode());
			w.getPractitioner().getAddress().setStreet(practitioner.getAddress().getStreet());
			w.getPractitioner().getAddress().setHouseNr(practitioner.getAddress().getHouseNr());
		}
		return new SingleDebtorInvoice(w);
	}

	public String stringifySingleDebtor(SingleDebtorInvoice invoice, boolean pretty) throws JsonProcessingException {
		return pretty ? om.writerWithDefaultPrettyPrinter().writeValueAsString(invoice)
		: om.writeValueAsString(invoice);
	}
}
