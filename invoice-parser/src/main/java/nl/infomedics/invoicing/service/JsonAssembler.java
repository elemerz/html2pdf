package nl.infomedics.invoicing.service;
import nl.infomedics.invoicing.model.*;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class JsonAssembler {
	private final ObjectMapper om;

	public JsonAssembler() {
		this.om = new ObjectMapper()
		.setSerializationInclusion(JsonInclude.Include.NON_NULL)
		.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
		.registerModule(new JavaTimeModule());
	}


	public InvoiceBundle assemble(MetaInfo meta, Practitioner practitioner, Map<String, Debiteur> debi, Map<String, List<Specificatie>> specs) {
		debi.forEach((id, d) -> d.setTreatments(specs.getOrDefault(id, List.of())));
		List<DebiteurWithPractitioner> list = new ArrayList<>();
		for (Debiteur d : debi.values()) {
			DebiteurWithPractitioner w = new DebiteurWithPractitioner();
			if (w.getDebiteur()==null) w.setDebiteur(new Debiteur());
			w.getDebiteur().setInvoiceNumber(d.getInvoiceNumber());
			w.getDebiteur().setPracticeName(d.getPracticeName());
			w.getDebiteur().setPracticeCity(d.getPracticeCity());
			w.getDebiteur().setInsuredId(d.getInsuredId());
			w.getDebiteur().setPatientName(d.getPatientName());
			w.getDebiteur().setPatientDob(d.getPatientDob());
			w.getDebiteur().setInsurer(d.getInsurer());
			w.getDebiteur().setPeriodFrom(d.getPeriodFrom());
			w.getDebiteur().setPeriodTo(d.getPeriodTo());
			w.getDebiteur().setInvoiceType(d.getInvoiceType());
			w.getDebiteur().setTotals(d.getTotals());
			w.getDebiteur().setImageUrl(d.getImageUrl());
			w.setTreatments(d.getTreatments());
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
			w.setTotaalBedrag(meta!=null?meta.getTotaalBedrag():null);
			list.add(w);
		}
		return new InvoiceBundle(list);
	}


	public String stringify(InvoiceBundle bundle, boolean pretty) throws JsonProcessingException {
		return pretty ? om.writerWithDefaultPrettyPrinter().writeValueAsString(bundle)
		: om.writeValueAsString(bundle);
	}

	public SingleDebtorInvoice createSingleDebtorInvoice(MetaInfo meta, Practitioner practitioner, Debiteur debiteur) {
		DebiteurWithPractitioner w = new DebiteurWithPractitioner();
		if (w.getDebiteur()==null) w.setDebiteur(new Debiteur());
		w.getDebiteur().setInvoiceNumber(debiteur.getInvoiceNumber());
		w.getDebiteur().setPracticeName(debiteur.getPracticeName());
		w.getDebiteur().setPracticeCity(debiteur.getPracticeCity());
		w.getDebiteur().setInsuredId(debiteur.getInsuredId());
		w.getDebiteur().setPatientName(debiteur.getPatientName());
		w.getDebiteur().setPatientDob(debiteur.getPatientDob());
		w.getDebiteur().setInsurer(debiteur.getInsurer());
		w.getDebiteur().setPeriodFrom(debiteur.getPeriodFrom());
		w.getDebiteur().setPeriodTo(debiteur.getPeriodTo());
		w.getDebiteur().setInvoiceType(debiteur.getInvoiceType());
		w.getDebiteur().setTotals(debiteur.getTotals());
		w.getDebiteur().setImageUrl(debiteur.getImageUrl());
		w.setTreatments(debiteur.getTreatments());
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
		w.setTotaalBedrag(meta!=null?meta.getTotaalBedrag():null);
		return new SingleDebtorInvoice(w);
	}

	public String stringifySingleDebtor(SingleDebtorInvoice invoice, boolean pretty) throws JsonProcessingException {
		return pretty ? om.writerWithDefaultPrettyPrinter().writeValueAsString(invoice)
		: om.writeValueAsString(invoice);
	}
}
