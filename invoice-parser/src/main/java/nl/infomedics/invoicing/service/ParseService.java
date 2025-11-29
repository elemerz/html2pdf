package nl.infomedics.invoicing.service;

import java.io.Reader;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamReader;

import org.springframework.stereotype.Service;

import com.univocity.parsers.csv.CsvParser;
import com.univocity.parsers.csv.CsvParserSettings;

import nl.infomedics.invoicing.model.Debiteur;
import nl.infomedics.invoicing.model.MetaInfo;
import nl.infomedics.invoicing.model.Practitioner;
import nl.infomedics.invoicing.model.Specificatie;

@Service
public class ParseService {
	private static final DateTimeFormatter NL_DATE_FORMATTER = DateTimeFormatter.ofPattern("dd-MM-yyyy");

	private static final int CSV_IDX_DEB_HCP_NAME = 1;
	private static final int CSV_IDX_DEB_HCP_STREET = 2;
	private static final int CSV_IDX_DEB_HCP_HOUSE_NR = 3;
	private static final int CSV_IDX_DEB_HCP_ZIP = 4;
	private static final int CSV_IDX_DEB_HCP_CITY = 5;
	private static final int CSV_IDX_DEB_INVOICE_NR = 6;
	private static final int CSV_IDX_DEB_PATIENT_NAME = 7;
	private static final int CSV_IDX_DEB_PATIENT_DOB = 8;
	private static final int CSV_IDX_DEB_INSURER = 10;
	private static final int CSV_IDX_DEB_STREET = 12;
	private static final int CSV_IDX_DEB_HOUSE_NR = 13;
	private static final int CSV_IDX_DEB_ZIP = 14;
	private static final int CSV_IDX_DEB_CITY = 15;
	private static final int CSV_IDX_DEB_PRINT_DATE = 16;
	private static final int CSV_IDX_DEB_EXP_DATE = 17;
	private static final int CSV_IDX_DEB_TYPE = 18;
	private static final int CSV_IDX_DEB_AMOUNT = 20;
	private static final int CSV_IDX_DEB_OPEN_IMF = 22;
	private static final int CSV_IDX_DEB_IMAGE_URL = 70;
	private static final int CSV_IDX_DEB_PRACTICE_AGB = 84;
	private static final int CSV_IDX_DEB_HCP_AGB = 85;

	private static final int CSV_IDX_SPEC_INVOICE_NR = 0;
	private static final int CSV_IDX_SPEC_DATE = 1;
	private static final int CSV_IDX_SPEC_CODE = 2;
	private static final int CSV_IDX_SPEC_DESC = 3;
	private static final int CSV_IDX_SPEC_AMOUNT = 4;
	private static final int CSV_IDX_SPEC_PROVIDER = 5;
	private static final int CSV_IDX_SPEC_VAT_IND = 8;
	private static final int CSV_IDX_SPEC_VAT_VAL = 9;

	private static String getRecordValue(com.univocity.parsers.common.record.Record record, int index) {
		return index < record.getValues().length ? record.getString(index) : null;
	}

	private static Integer safeParseInt(String value) {
		try {
			return value == null || value.isBlank() ? null : Integer.parseInt(value);
		} catch (Exception e) {
			return null;
		}
	}

	private static LocalDate parseDutchDate(String value) {
		try {
			return (value == null || value.isBlank()) ? null : LocalDate.parse(value, NL_DATE_FORMATTER);
		} catch (Exception e) {
			return null;
		}
	}

	/**
	 * Parses the meta information from the reader.
	 * Expects lines like "# type 20 : 4" and "# bedrag : 168,79".
	 * 
	 * @param reader The reader for the meta file content.
	 * @return MetaInfo object containing the invoice type and total amount.
	 */
	public MetaInfo parseMeta(Reader reader) {
		Pattern typePattern = Pattern.compile("#\\s*type\\s*(\\d+)\\s*:\\s*(\\d+)");
		Pattern amountPattern = Pattern.compile("#\\s*bedrag\\s*:\\s*([0-9]+,[0-9]{2})");
		
		Integer invoiceType = null;
		BigDecimal totalAmount = null;
		
		try (Scanner scanner = new Scanner(reader)) {
			while (scanner.hasNextLine()) {
				String line = scanner.nextLine().trim();
				
				Matcher typeMatcher = typePattern.matcher(line);
				if (typeMatcher.matches()) {
					Integer type = Integer.parseInt(typeMatcher.group(1));
					Integer count = Integer.parseInt(typeMatcher.group(2));
					// If we found a valid count, capture the type (first occurrence wins)
					if (count != null && count > 0 && invoiceType == null) {
						invoiceType = type; 
					}
				}
				
				Matcher amountMatcher = amountPattern.matcher(line);
				if (amountMatcher.matches()) {
					totalAmount = new BigDecimal(amountMatcher.group(1).replace(',', '.'));
				}
			}
		}
		return new MetaInfo(invoiceType, totalAmount);
	}

	private Practitioner practitioner; // captured from last line of Debiteuren file

	public Practitioner getPractitioner() { return practitioner; }

	/**
	 * Parses the Debiteuren CSV file.
	 * The last line is expected to contain Practitioner information.
	 * 
	 * @param reader The reader for the debiteuren file content.
	 * @return A map of Debiteur objects keyed by insured ID.
	 */
	public Map<String, Debiteur> parseDebiteuren(Reader reader) {
		CsvParser parser = createCsvParser();
		List<com.univocity.parsers.common.record.Record> rows = new ArrayList<>();
		parser.iterateRecords(reader).forEach(rows::add);
		
		Map<String, Debiteur> debiteurMap = new LinkedHashMap<>();
		
		// Process all rows except the last one (which is the practitioner)
		for (int i = 0; i < rows.size() - 1; i++) {
			var record = rows.get(i);
			Debiteur debiteur = mapRecordToDebiteur(record);
			if (debiteur.getInsuredId() != null && !debiteur.getInsuredId().isBlank()) {
				debiteurMap.put(debiteur.getInsuredId(), debiteur);
			}
		}

		// Last classic row is practitioner(doctor): extract directly from columns
		if (!rows.isEmpty()) {
			parsePractitioner(rows.get(rows.size() - 1));
		}
		
		return debiteurMap;
	}

	private CsvParser createCsvParser() {
		CsvParserSettings settings = new CsvParserSettings();
		settings.getFormat().setLineSeparator("\n");
		settings.getFormat().setDelimiter(';');
		settings.setHeaderExtractionEnabled(false);
		return new CsvParser(settings);
	}

	private Debiteur mapRecordToDebiteur(com.univocity.parsers.common.record.Record record) {
		Debiteur debiteur = new Debiteur();
		debiteur.setInvoiceNumber(getRecordValue(record, CSV_IDX_DEB_INVOICE_NR));
		debiteur.setHcpName(getRecordValue(record, CSV_IDX_DEB_HCP_NAME));
		debiteur.setHcpStreet(getRecordValue(record, CSV_IDX_DEB_HCP_STREET));
		debiteur.setHcpHouseNr(getRecordValue(record, CSV_IDX_DEB_HCP_HOUSE_NR));
		debiteur.setHcpZipCode(getRecordValue(record, CSV_IDX_DEB_HCP_ZIP));
		debiteur.setHcpCity(getRecordValue(record, CSV_IDX_DEB_HCP_CITY));
		debiteur.setPracticeAgb(getRecordValue(record, CSV_IDX_DEB_PRACTICE_AGB));
		debiteur.setHcpAgb(getRecordValue(record, CSV_IDX_DEB_HCP_AGB));
		debiteur.setInsuredId(getRecordValue(record, CSV_IDX_DEB_INVOICE_NR)); // Note: using invoice nr as insured id based on original code logic (idx 6)
		debiteur.setPatientName(getRecordValue(record, CSV_IDX_DEB_PATIENT_NAME));
		debiteur.setPatientDob(parseDutchDate(getRecordValue(record, CSV_IDX_DEB_PATIENT_DOB)));
		debiteur.setInsurer(getRecordValue(record, CSV_IDX_DEB_INSURER));
		debiteur.setStreet(getRecordValue(record, CSV_IDX_DEB_STREET));
		debiteur.setHouseNr(getRecordValue(record, CSV_IDX_DEB_HOUSE_NR));
		debiteur.setZipCode(getRecordValue(record, CSV_IDX_DEB_ZIP));
		debiteur.setCity(getRecordValue(record, CSV_IDX_DEB_CITY));
		debiteur.setPrintDate(getRecordValue(record, CSV_IDX_DEB_PRINT_DATE));
		debiteur.setPeriodFrom(parseDutchDate(getRecordValue(record, CSV_IDX_DEB_PRINT_DATE)));
		debiteur.setFirstExpirationDate(getRecordValue(record, CSV_IDX_DEB_EXP_DATE));
		debiteur.setInvoiceType(safeParseInt(getRecordValue(record, CSV_IDX_DEB_TYPE)));
		debiteur.setInvoiceAmountCents(safeParseInt(getRecordValue(record, CSV_IDX_DEB_AMOUNT)));
		debiteur.setOpenImfCents(safeParseInt(getRecordValue(record, CSV_IDX_DEB_OPEN_IMF)));
		debiteur.setImageUrl(getRecordValue(record, CSV_IDX_DEB_IMAGE_URL));
		return debiteur;
	}

	private void parsePractitioner(com.univocity.parsers.common.record.Record record) {
		this.practitioner = new Practitioner();
		// Defensive: practitioner now initializes nested objects, but guard anyway
		if (this.practitioner.getPractice() == null) this.practitioner.setPractice(new nl.infomedics.invoicing.model.Practice());
		if (this.practitioner.getAddress() == null) this.practitioner.setAddress(new nl.infomedics.invoicing.model.Address());
		
		this.practitioner.getPractice().setName(getRecordValue(record, 1));
		this.practitioner.getAddress().setStreet(getRecordValue(record, 2));
		this.practitioner.getAddress().setHouseNr(getRecordValue(record, 3));
		this.practitioner.getAddress().setPostcode(getRecordValue(record, 4));
		this.practitioner.getAddress().setCity(getRecordValue(record, 5));
		this.practitioner.setAgbCode(getRecordValue(record, 6));
		
		this.practitioner.getPractice().setCode(""); // unknown in classic line
		this.practitioner.getAddress().setCountry("");
		this.practitioner.getPractice().setPhone("");
		this.practitioner.setLogoNr(0);
		this.practitioner.normalize();
	}

	/**
	 * Parses the Specificaties CSV file.
	 * 
	 * @param reader The reader for the specificaties file content.
	 * @return A map of lists of Specificatie objects, keyed by invoice number.
	 */
	public Map<String, List<Specificatie>> parseSpecificaties(Reader reader) {
		CsvParser parser = createCsvParser();
		Map<String, List<Specificatie>> specificatieMap = new LinkedHashMap<>();
		
		for (com.univocity.parsers.common.record.Record record : parser.iterateRecords(reader)) {
			String invoiceNumber = getRecordValue(record, CSV_IDX_SPEC_INVOICE_NR);
			if (invoiceNumber == null) continue;
			
			Specificatie specificatie = mapRecordToSpecificatie(record, invoiceNumber);
			specificatieMap.computeIfAbsent(invoiceNumber, _ -> new ArrayList<>()).add(specificatie);
		}
		return specificatieMap;
	}

	private Specificatie mapRecordToSpecificatie(com.univocity.parsers.common.record.Record record, String invoiceNumber) {
		Specificatie specificatie = new Specificatie();
		specificatie.setInvoiceNumber(invoiceNumber);
		specificatie.setDate(parseDutchDate(getRecordValue(record, CSV_IDX_SPEC_DATE)));
		specificatie.setTreatmentCode(getRecordValue(record, CSV_IDX_SPEC_CODE));
		specificatie.setDescription(getRecordValue(record, CSV_IDX_SPEC_DESC));
		specificatie.setAmountCents(safeParseInt(getRecordValue(record, CSV_IDX_SPEC_AMOUNT)));
		specificatie.setTreatmentProvider(getRecordValue(record, CSV_IDX_SPEC_PROVIDER));
		specificatie.setVatIndicator(getRecordValue(record, CSV_IDX_SPEC_VAT_IND));
		specificatie.setVatValueCents(getRecordValue(record, CSV_IDX_SPEC_VAT_VAL));
		return specificatie;
	}

	// ---- XML Notas parsing (for *_Notas.xml) ----
	public static class NotasParseResult {
		public Map<String, Debiteur> debiteuren;
		public Map<String, List<Specificatie>> specificaties;
		public Practitioner practitioner;
	}

	/**
	 * Parses the XML Notas file.
	 * 
	 * @param reader The reader for the XML content.
	 * @return A NotasParseResult containing parsed debiteuren, specificaties, and practitioner.
	 */
	public NotasParseResult parseNotas(Reader reader) {
		NotasParseResult result = new NotasParseResult();
		result.debiteuren = new LinkedHashMap<>();
		result.specificaties = new LinkedHashMap<>();
		result.practitioner = null;

		try {
			XMLInputFactory factory = XMLInputFactory.newFactory();
			XMLStreamReader xmlReader = factory.createXMLStreamReader(reader);
			
			// Context variables to hold state during parsing
			XmlParseContext context = new XmlParseContext();

			while (xmlReader.hasNext()) {
				int eventType = xmlReader.next();
				if (eventType == XMLStreamConstants.START_ELEMENT) {
					handleStartElement(xmlReader, result, context);
				} else if (eventType == XMLStreamConstants.END_ELEMENT) {
					handleEndElement(xmlReader, result);
				}
			}
		} catch (Exception ignored) { 
			// In a real app, we should probably log this or rethrow
		}
		return result;
	}

	private void handleStartElement(XMLStreamReader xmlReader, NotasParseResult result, XmlParseContext context) {
		String localName = xmlReader.getLocalName();
		switch (localName) {
			case "Nota":
				context.currentNotaInvoiceNumber = getAttribute(xmlReader, "Uniek_document_nr");
				context.currentImageUrl = getAttribute(xmlReader, "Tracking_pixel_URL");
				context.currentInvoiceType = safeParseInt(getAttribute(xmlReader, "Type_nota"));
				context.periodFrom = parseIsoDate(getAttribute(xmlReader, "Dagtekening"));
				context.periodTo = parseIsoDate(getAttribute(xmlReader, "Uiterste_betaaldatum"));
				break;
			case "Debiteur":
				context.debiteurNum = getAttribute(xmlReader, "Debiteurnummer");
				context.debiteurName = getAttribute(xmlReader, "Opgemaakte_naam");
				break;
			case "Aanbieder":
				handleAanbieder(xmlReader, result, context);
				break;
			case "Adres":
				handleAdres(xmlReader, result, context);
				break;
			case "Patient":
				handlePatient(xmlReader, result, context);
				break;
			case "Prestatie":
				handlePrestatie(xmlReader, result, context);
				break;
		}
	}

	private void handleAanbieder(XMLStreamReader xmlReader, NotasParseResult result, XmlParseContext context) {
		context.practitionerName = getAttribute(xmlReader, "Naam");
		String agb = getAttribute(xmlReader, "Agb-code_zorgverlener");
		String praktijkCode = getAttribute(xmlReader, "Praktijk_code");
		String logoNr = getAttribute(xmlReader, "Logo_nr");
		
		if (result.practitioner == null) result.practitioner = new Practitioner();
		if (result.practitioner.getPractice() == null) result.practitioner.setPractice(new nl.infomedics.invoicing.model.Practice());
		
		result.practitioner.getPractice().setName(context.practitionerName);
		result.practitioner.setAgbCode(agb);
		result.practitioner.getPractice().setCode(praktijkCode);
		try { 
			result.practitioner.setLogoNr(logoNr == null ? 0 : Integer.parseInt(logoNr)); 
		} catch(Exception e) { 
			result.practitioner.setLogoNr(0); 
		}
	}

	private void handleAdres(XMLStreamReader xmlReader, NotasParseResult result, XmlParseContext context) {
		String plaats = getAttribute(xmlReader, "Plaats");
		String straat = getAttribute(xmlReader, "Straat");
		String huisnr = getAttribute(xmlReader, "Huisnummer");
		String postcode = getAttribute(xmlReader, "Postcode");
		String land = getAttribute(xmlReader, "Land");
		String tel = getAttribute(xmlReader, "Telefoonnummer");
		
		// If we have a practitioner name but no debiteur number yet, this address belongs to the practitioner
		if (context.practitionerName != null && context.debiteurNum == null) {
			if (result.practitioner == null) result.practitioner = new Practitioner();
			result.practitioner.getAddress().setCity(plaats);
			result.practitioner.getAddress().setStreet(straat);
			result.practitioner.getAddress().setHouseNr(huisnr);
			result.practitioner.getAddress().setPostcode(postcode);
			result.practitioner.getAddress().setCountry("Nederland".equalsIgnoreCase(land) ? "Netherlands" : land);
			result.practitioner.getPractice().setPhone(tel);
			
			// Store city for later use in Debiteur
			context.practitionerCity = plaats;
		}
	}

	private void handlePatient(XMLStreamReader xmlReader, NotasParseResult result, XmlParseContext context) {
		String patientName = getAttribute(xmlReader, "Opgemaakte_naam");
		LocalDate dob = parseIsoDate(getAttribute(xmlReader, "Geboortedatum"));
		String insurer = getAttribute(xmlReader, "Verzekeraar");
		
		if (context.debiteurNum != null) {
			Debiteur debiteur = new Debiteur();
			debiteur.setInvoiceNumber(context.currentNotaInvoiceNumber);
			debiteur.setHcpName(context.practitionerName);
			debiteur.setHcpCity(context.practitionerCity);
			debiteur.setInsuredId(context.debiteurNum);
			debiteur.setPatientName(patientName != null ? patientName : context.debiteurName);
			debiteur.setPatientDob(dob);
			debiteur.setInsurer(insurer);
			debiteur.setPeriodFrom(context.periodFrom);
			debiteur.setPeriodTo(context.periodTo);
			debiteur.setInvoiceType(context.currentInvoiceType);
			debiteur.setImageUrl(context.currentImageUrl);
			result.debiteuren.put(context.debiteurNum, debiteur);
		}
	}

	private void handlePrestatie(XMLStreamReader xmlReader, NotasParseResult result, XmlParseContext context) {
		String bedrag = getAttribute(xmlReader, "Bedrag");
		Specificatie specificatie = new Specificatie();
		specificatie.setInvoiceNumber(context.debiteurNum);
		specificatie.setDate(parseIsoDate(getAttribute(xmlReader, "Datum")));
		specificatie.setTreatmentCode(getAttribute(xmlReader, "Prestatiecode"));
		specificatie.setDescription(getAttribute(xmlReader, "Omschrijving"));
		specificatie.setTreatmentProvider(getAttribute(xmlReader, "id"));
		
		if (bedrag != null) {
			try { 
				specificatie.setAmountCents(new BigDecimal(bedrag).movePointRight(2).intValue()); 
			} catch(Exception ignored) {}
		}
		
		if (context.debiteurNum != null) {
			result.specificaties.computeIfAbsent(context.debiteurNum, _ -> new ArrayList<>()).add(specificatie);
		}
	}

	private void handleEndElement(XMLStreamReader xmlReader, NotasParseResult result) {
		String localName = xmlReader.getLocalName();
		if ("Aanbieder".equals(localName)) {
			if (result.practitioner != null) {
				result.practitioner.normalize();
			}
		}
	}

	// Helper class to maintain state during XML parsing
	private static class XmlParseContext {
		String currentNotaInvoiceNumber;
		String currentImageUrl;
		Integer currentInvoiceType;
		LocalDate periodFrom;
		LocalDate periodTo;
		String debiteurNum;
		String debiteurName;
		String practitionerName;
		String practitionerCity;
	}

	private static String getAttribute(XMLStreamReader xmlReader, String name) {
		String value = xmlReader.getAttributeValue(null, name);
		return (value == null || value.isBlank()) ? null : value;
	}

	private static LocalDate parseIsoDate(String value) {
		try { return (value == null || value.isBlank()) ? null : LocalDate.parse(value); } catch(Exception e){ return null; }
	}
}

