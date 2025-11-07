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
		// join on insuredId
		debi.forEach((id, d) -> d.setTreatments(specs.getOrDefault(id, List.of())));
		return new InvoiceBundle(meta, practitioner, new ArrayList<>(debi.values()));
	}


	public String stringify(InvoiceBundle bundle, boolean pretty) throws JsonProcessingException {
		return pretty ? om.writerWithDefaultPrettyPrinter().writeValueAsString(bundle)
		: om.writeValueAsString(bundle);
	}
}
