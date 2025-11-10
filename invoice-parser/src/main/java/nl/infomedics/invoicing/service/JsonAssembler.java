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
			w.setInvoiceNumber(d.getInvoiceNumber());
			w.setPracticeName(d.getPracticeName());
			w.setPracticeCity(d.getPracticeCity());
			w.setInsuredId(d.getInsuredId());
			w.setPatientName(d.getPatientName());
			w.setPatientDob(d.getPatientDob());
			w.setInsurer(d.getInsurer());
			w.setPeriodFrom(d.getPeriodFrom());
			w.setPeriodTo(d.getPeriodTo());
			w.setInvoiceType(d.getInvoiceType());
			w.setTotals(d.getTotals());
			w.setImageUrl(d.getImageUrl());
			w.setTreatments(d.getTreatments());
			if (practitioner != null) {
				w.setPractitionerName(practitioner.getPracticeName());
				w.setPractitionerAgbCode(practitioner.getAgbCode());
				w.setPractitionerPracticeCode(practitioner.getPracticeCode());
				w.setPractitionerLogoNr(practitioner.getLogoNr());
				w.setPractitionerCountry(practitioner.getPracticeCountry());
				w.setPractitionerPostcode(practitioner.getPracticePostcode());
				w.setPractitionerStreet(practitioner.getPracticeStreet());
				w.setPractitionerHouseNr(practitioner.getPracticeHouseNr());
				w.setPractitionerPhone(practitioner.getPracticePhone());
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
		w.setInvoiceNumber(debiteur.getInvoiceNumber());
		w.setPracticeName(debiteur.getPracticeName());
		w.setPracticeCity(debiteur.getPracticeCity());
		w.setInsuredId(debiteur.getInsuredId());
		w.setPatientName(debiteur.getPatientName());
		w.setPatientDob(debiteur.getPatientDob());
		w.setInsurer(debiteur.getInsurer());
		w.setPeriodFrom(debiteur.getPeriodFrom());
		w.setPeriodTo(debiteur.getPeriodTo());
		w.setInvoiceType(debiteur.getInvoiceType());
		w.setTotals(debiteur.getTotals());
		w.setImageUrl(debiteur.getImageUrl());
		w.setTreatments(debiteur.getTreatments());
		if (practitioner != null) {
			w.setPractitionerName(practitioner.getPracticeName());
			w.setPractitionerAgbCode(practitioner.getAgbCode());
			w.setPractitionerPracticeCode(practitioner.getPracticeCode());
			w.setPractitionerLogoNr(practitioner.getLogoNr());
			w.setPractitionerCountry(practitioner.getPracticeCountry());
			w.setPractitionerPostcode(practitioner.getPracticePostcode());
			w.setPractitionerStreet(practitioner.getPracticeStreet());
			w.setPractitionerHouseNr(practitioner.getPracticeHouseNr());
			w.setPractitionerPhone(practitioner.getPracticePhone());
		}
		w.setTotaalBedrag(meta!=null?meta.getTotaalBedrag():null);
		return new SingleDebtorInvoice(w);
	}

	public String stringifySingleDebtor(SingleDebtorInvoice invoice, boolean pretty) throws JsonProcessingException {
		return pretty ? om.writerWithDefaultPrettyPrinter().writeValueAsString(invoice)
		: om.writeValueAsString(invoice);
	}
}
