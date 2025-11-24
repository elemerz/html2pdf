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
	private static final DateTimeFormatter NL = DateTimeFormatter.ofPattern("dd-MM-yyyy");

	private static String get(com.univocity.parsers.common.record.Record r, int idx) {
		return idx < r.getValues().length ? r.getString(idx) : null;
	}

	private static Integer safeInt(String s) {
		try {
			return s == null || s.isBlank() ? null : Integer.parseInt(s);
		} catch (Exception e) {
			return null;
		}
	}

	private static LocalDate parseDate(String s) {
		try {
			return (s == null || s.isBlank()) ? null : LocalDate.parse(s, NL);
		} catch (Exception e) {
			return null;
		}
	}

	public MetaInfo parseMeta(Reader reader) {
		// Example lines: "# type 20 : 4", "# bedrag : 168,79"
		Pattern typePat = Pattern.compile("#\\s*type\\s*(\\d+)\\s*:\\s*(\\d+)");
		Pattern amountPat = Pattern.compile("#\\s*bedrag\\s*:\\s*([0-9]+,[0-9]{2})");
		Integer invoiceType = null;
		BigDecimal bedrag = null;
		try (Scanner sc = new Scanner(reader)) {
			while (sc.hasNextLine()) {
				String line = sc.nextLine().trim();
				Matcher m = typePat.matcher(line);
				if (m.matches()) {
					Integer type = Integer.parseInt(m.group(1));
					Integer count = Integer.parseInt(m.group(2));
					if (count != null && count > 0 && invoiceType == null) {
						invoiceType = type; // count ignored (removed)
					}
				}
				Matcher a = amountPat.matcher(line);
				if (a.matches()) bedrag = new BigDecimal(a.group(1).replace(',', '.'));
			}
		}
		return new MetaInfo(invoiceType, bedrag);
	}

	private Practitioner practitioner; // captured from last line

	public Practitioner getPractitioner() { return practitioner; }

	public Map<String, Debiteur> parseDebiteuren(Reader reader) {
		CsvParserSettings st = new CsvParserSettings();
		st.getFormat().setLineSeparator("\n");
		st.getFormat().setDelimiter(';');
		st.setHeaderExtractionEnabled(false);
		CsvParser p = new CsvParser(st);
		List<com.univocity.parsers.common.record.Record> rows = new ArrayList<>();
		p.iterateRecords(reader).forEach(rows::add);
		Map<String, Debiteur> map = new LinkedHashMap<>();
		for (int i=0;i<rows.size() -1 ;i++) {
			var r = rows.get(i);
			String zorgId = get(r, 6); // debiteur/insured id used to join with specificaties
			Debiteur d = new Debiteur();
			d.setInvoiceNumber(get(r, 6));
			d.setHcpName(get(r, 1));
			d.setHcpStreet(get(r, 2));
			d.setHcpHouseNr(get(r, 3));
			d.setHcpZipCode(get(r, 4));
			d.setHcpCity(get(r, 5));
			d.setPracticeAgb(get(r, 84));
			d.setHcpAgb(get(r, 85));
			d.setInsuredId(zorgId);
			d.setPatientName(get(r, 7));
			d.setPatientDob(parseDate(get(r, 8)));
			d.setInsurer(get(r, 10));
			d.setStreet(get(r, 12));
			d.setHouseNr(get(r, 13));
			d.setZipCode(get(r, 14));
			d.setCity(get(r, 15));
			d.setPrintDate(get(r,16));
			d.setPeriodFrom(parseDate(get(r, 16)));
			d.setFirstExpirationDate(get(r, 17));
			d.setInvoiceType(safeInt(get(r, 18))); // e.g., 20
			d.setInvoiceAmountCents(safeInt(get(r, 20)));
			d.setOpenImfCents(safeInt(get(r,22)));
			d.setImageUrl(get(r, 70));
			if (zorgId!=null && !zorgId.isBlank()) {
				map.put(zorgId, d);
			}
		}

		// Last classic row is practitioner(doctor): extract directly from columns
		parsePractitioner(rows.get(rows.size() -1));
		return map;
	}

	private void parsePractitioner(com.univocity.parsers.common.record.Record r) {
		this.practitioner = new Practitioner();
		// Defensive: practitioner now initializes nested objects, but guard anyway
		if (this.practitioner.getPractice()==null) this.practitioner.setPractice(new nl.infomedics.invoicing.model.Practice());
		if (this.practitioner.getAddress()==null) this.practitioner.setAddress(new nl.infomedics.invoicing.model.Address());
		this.practitioner.getPractice().setName(get(r,1));
		this.practitioner.getAddress().setStreet(get(r,2));
		String house = get(r,3);
		this.practitioner.getAddress().setHouseNr(house);
		this.practitioner.getAddress().setPostcode(get(r,4));
		this.practitioner.getAddress().setCity(get(r,5));
		this.practitioner.setAgbCode(get(r,6));
		this.practitioner.getPractice().setCode(""); // unknown in classic line
		this.practitioner.getAddress().setCountry("");
		this.practitioner.getPractice().setPhone("");
		this.practitioner.setLogoNr(0);
		this.practitioner.normalize();
	}

	public Map<String, List<Specificatie>> parseSpecificaties(Reader reader) {
		CsvParserSettings st = new CsvParserSettings();
		st.getFormat().setLineSeparator("\n");
		st.getFormat().setDelimiter(';');
		st.setHeaderExtractionEnabled(false);
		CsvParser p = new CsvParser(st);
		Map<String, List<Specificatie>> map = new LinkedHashMap<>();
		for (com.univocity.parsers.common.record.Record r : p.iterateRecords(reader)) {
			String invoiceNumber = get(r, 0);
			if (invoiceNumber==null) continue;
			Specificatie s = new Specificatie();
			s.setInvoiceNumber(invoiceNumber);
			s.setDate(parseDate(get(r, 1)));
			s.setTreatmentCode(get(r, 2));
			s.setDescription(get(r, 3));
			s.setAmountCents(safeInt(get(r, 4)));
			s.setTreatmentProvider(get(r, 5));
			s.setVatIndicator(get(r, 8));
			s.setVatValueCents(get(r, 9));
			map.computeIfAbsent(invoiceNumber, _ -> new ArrayList<>()).add(s);
		}
		return map;
	}

	// ---- XML Notas parsing (for *_Notas.xml) ----
	public static class NotasParseResult {
		public Map<String, Debiteur> debiteuren;
		public Map<String, List<Specificatie>> specificaties;
		public Practitioner practitioner;
	}

	public NotasParseResult parseNotas(Reader reader) {
		NotasParseResult out = new NotasParseResult();
		out.debiteuren = new LinkedHashMap<>();
		out.specificaties = new LinkedHashMap<>();
		out.practitioner = null;
		try {
			XMLInputFactory f = XMLInputFactory.newFactory();
			XMLStreamReader xr = f.createXMLStreamReader(reader);
			String currentNotaInvoiceNumber=null, currentImageUrl=null; Integer currentInvoiceType=null; LocalDate periodFrom=null, periodTo=null;
			String debiteurNum=null, debiteurName=null, practitionerName=null, practitionerCity=null;
			while (xr.hasNext()) {
				int ev = xr.next();
				if (ev==XMLStreamConstants.START_ELEMENT) {
					String local = xr.getLocalName();
					if ("Nota".equals(local)) {
						currentNotaInvoiceNumber = attr(xr, "Uniek_document_nr");
						currentImageUrl = attr(xr, "Tracking_pixel_URL");
						currentInvoiceType = safeInt(attr(xr, "Type_nota"));
						periodFrom = parseDateIso(attr(xr, "Dagtekening"));
						periodTo = parseDateIso(attr(xr, "Uiterste_betaaldatum"));
					}
					else if ("Debiteur".equals(local)) {
						debiteurNum = attr(xr, "Debiteurnummer");
						debiteurName = attr(xr, "Opgemaakte_naam");
					}
					else if ("Aanbieder".equals(local)) {
						practitionerName = attr(xr, "Naam");
						String agb = attr(xr, "Agb-code_zorgverlener");
						String praktijkCode = attr(xr, "Praktijk_code");
						String logoNr = attr(xr, "Logo_nr");
						if (out.practitioner==null) out.practitioner = new Practitioner();
						if (out.practitioner.getPractice()==null) out.practitioner.setPractice(new nl.infomedics.invoicing.model.Practice());
						out.practitioner.getPractice().setName(practitionerName);
						out.practitioner.setAgbCode(agb);
						out.practitioner.getPractice().setCode(praktijkCode);
						try { out.practitioner.setLogoNr(logoNr==null?0:Integer.parseInt(logoNr)); } catch(Exception e){ out.practitioner.setLogoNr(0); }
					}
					else if ("Adres".equals(local)) {
						String plaats = attr(xr, "Plaats");
						String straat = attr(xr, "Straat");
						String huisnr = attr(xr, "Huisnummer");
						String postcode = attr(xr, "Postcode");
						String land = attr(xr, "Land");
						String tel = attr(xr, "Telefoonnummer");
						if (practitionerName != null && debiteurNum == null) {
							if (out.practitioner==null) out.practitioner = new Practitioner();
							out.practitioner.getAddress().setCity(plaats);
							out.practitioner.getAddress().setStreet(straat);
							out.practitioner.getAddress().setHouseNr(huisnr);
							out.practitioner.getAddress().setPostcode(postcode);
							out.practitioner.getAddress().setCountry("Nederland".equalsIgnoreCase(land)?"Netherlands":land);
							out.practitioner.getPractice().setPhone(tel);
						}
					}
					else if ("Patient".equals(local)) {
						String patientName = attr(xr, "Opgemaakte_naam");
						LocalDate dob = parseDateIso(attr(xr, "Geboortedatum"));
						String insurer = attr(xr, "Verzekeraar");
						if (debiteurNum!=null) {
							Debiteur d = new Debiteur();
							d.setInvoiceNumber(currentNotaInvoiceNumber);
							d.setHcpName(practitionerName);
							d.setHcpCity(practitionerCity);
							d.setInsuredId(debiteurNum);
							d.setPatientName(patientName!=null?patientName:debiteurName);
							d.setPatientDob(dob);
							d.setInsurer(insurer);
							d.setPeriodFrom(periodFrom);
							d.setPeriodTo(periodTo);
							d.setInvoiceType(currentInvoiceType);
							d.setImageUrl(currentImageUrl);
							out.debiteuren.put(debiteurNum, d);
						}
					}
					else if ("Prestatie".equals(local)) {
						String bedrag = attr(xr, "Bedrag");
						Specificatie s = new Specificatie();
						s.setInvoiceNumber(debiteurNum);
						s.setDate(parseDateIso(attr(xr, "Datum")));
						s.setTreatmentCode(attr(xr, "Prestatiecode"));
						s.setDescription(attr(xr, "Omschrijving"));
						s.setTreatmentProvider(attr(xr, "id"));
						if (bedrag!=null) {
							try { s.setAmountCents(new BigDecimal(bedrag).movePointRight(2).intValue()); } catch(Exception ignored) {}
						}
						if (debiteurNum!=null) {
							out.specificaties.computeIfAbsent(debiteurNum,_->new ArrayList<>()).add(s);
						}
					}
				}
				else if (ev==XMLStreamConstants.END_ELEMENT) {
					String local = xr.getLocalName();
					if ("Aanbieder".equals(local)) {
						if (out.practitioner!=null) {
							out.practitioner.normalize();
						}
					}
				}
			}
		} catch (Exception ignored) { }
		return out;
	}

	private static String attr(XMLStreamReader xr, String name) {
		String v = xr.getAttributeValue(null, name);
		return (v==null||v.isBlank())?null:v;
	}

	private static LocalDate parseDateIso(String s) {
		try { return (s==null||s.isBlank())?null: LocalDate.parse(s); } catch(Exception e){ return null; }
	}
}

