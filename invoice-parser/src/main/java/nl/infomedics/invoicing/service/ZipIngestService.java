package nl.infomedics.invoicing.service;

import nl.infomedics.invoicing.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import lombok.Getter;
import lombok.Setter;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import java.util.Objects;
@Getter @Setter
@Service
public class ZipIngestService {
	private static final Logger log = LoggerFactory.getLogger(ZipIngestService.class);

	private final ParseService parse;
	private final JsonAssembler json;
	private final AppProperties props;

	public ZipIngestService(ParseService parse, JsonAssembler json, AppProperties props, Xhtml2PdfClient pdfClient,
			@Value("${json.output.folder}") String jsonOut, @Value("${json.pretty:false}") boolean pretty,
			@Value("${pdf.output.folder:C:/invoice-data/_pdf}") String pdfOut)
			throws IOException {
		this.parse = parse;
		this.json = json;
		this.props = props;
		this.pdfClient = pdfClient;
		this.jsonOutDir = Paths.get(jsonOut);
		this.pdfOutDir = Paths.get(pdfOut);
		this.jsonPretty = pretty;
		Files.createDirectories(this.jsonOutDir);
		Files.createDirectories(this.pdfOutDir);
	}

	private final Path jsonOutDir;
	private final Path pdfOutDir;
	private final boolean jsonPretty;
	private final Xhtml2PdfClient pdfClient;

	public void processZip(Path zipPath) {
		String name = zipPath.getFileName().toString();
		String stage = "open zip";
		log.info("Processing {}", name);
		int debiSize = 0;
		int specSize = 0;
		try (ZipFile zf = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
			stage = "locate entries";
			ZipEntry meta = find(zf, e -> e.getName().endsWith("_Meta.txt"));
			ZipEntry debi = find(zf, e -> e.getName().endsWith("_Debiteuren.txt"));
			ZipEntry spec = find(zf, e -> e.getName().endsWith("_Specificaties.txt"));
			ZipEntry notas = find(zf, e -> e.getName().endsWith("_Notas.xml"));
			if (meta == null) throw new IllegalStateException("Missing meta entry in " + name);
			boolean xmlType = notas != null;
			if (!xmlType && (debi == null || spec == null))
				throw new IllegalStateException("Missing expected classic entries in " + name);
			log.debug("Entries resolved for {} → meta={}, debiteuren={}, specificaties={}, notasXml={}", name,
					meta.getName(), debi!=null?debi.getName():"-", spec!=null?spec.getName():"-", notas!=null?notas.getName():"-");

			stage = "parse meta";
			var metaInfo = parseWithReader(zf, meta, parse::parseMeta);
			Map<String, nl.infomedics.invoicing.model.Debiteur> debiteuren;
			Map<String, java.util.List<nl.infomedics.invoicing.model.Specificatie>> specificaties;
			var practitioner = (nl.infomedics.invoicing.model.Practitioner) null;
			if (xmlType) {
				stage = "parse notas xml";
				var nr = parseWithReader(zf, notas, reader1 -> parse.parseNotas(reader1));
				debiteuren = nr.debiteuren;
				specificaties = nr.specificaties;
				practitioner = nr.practitioner;
			} else {
				stage = "parse debiteuren";
				debiteuren = parseWithReader(zf, debi, parse::parseDebiteuren);
				stage = "parse specificaties";
				specificaties = parseWithReader(zf, spec, parse::parseSpecificaties);
				practitioner = parse.getPractitioner();
			}
			debiSize = debiteuren.size();
			specSize = specificaties.size();

			stage = "assemble json";
			var bundle = json.assemble(metaInfo, practitioner, debiteuren, specificaties);
			String jsonStr = json.stringify(bundle, jsonPretty);

			stage = "write json";
			Path out = jsonOutDir.resolve(stripZip(name) + ".json");
			Files.writeString(out, jsonStr, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

			// --- Generate PDF based on meta.invoiceType ---
			try {
				Integer type = bundle.getMeta()!=null?bundle.getMeta().getInvoiceType():null;
				if (type != null) {
					stage = "load template";
					String templateName = "templates/for-pdf/factuur-" + type + ".html";
					log.info("Loading template: {}", templateName);
					String html = new String(Objects.requireNonNull(getClass().getClassLoader().getResourceAsStream(templateName)).readAllBytes(), StandardCharsets.UTF_8);
					stage = "write html template";
					Path htmlOut = jsonOutDir.resolve(stripZip(name) + ".html");
					Files.writeString(htmlOut, html, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
					log.info("HTML template written to {}", htmlOut);
					stage = "convert pdf";
					byte[] pdf = pdfClient.convert(html, jsonStr);
					stage = "write pdf";
					Path pdfOut = pdfOutDir.resolve(stripZip(name) + ".pdf");
					Files.write(pdfOut, pdf, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
					log.info("PDF written to {}", pdfOut);
				} else {
					log.warn("PDF generation skipped for {}: invoiceType is null", name);
				}
			} catch (Exception pdfEx) {
				log.error("PDF generation FAILED for {} at stage '{}': {}", name, stage, pdfEx.getMessage(), pdfEx);
			}
		} catch (Exception ex) {
			try {
				Path err = Paths.get(props.getErrorFolder()).resolve(zipPath.getFileName());
				Files.move(zipPath, err, StandardCopyOption.REPLACE_EXISTING);
				log.warn("Moved {} to error folder after failure", name);
			} catch (Exception moveEx) {
				log.error("Failed to move {} to error folder: {}", name, moveEx.getMessage(), moveEx);
			}
			log.error("FAIL {} during {}: {}", name, stage, ex.getMessage(), ex);
			return; // abort on failure
		}
		// Success path: archive after ZipFile is closed (Windows requires file handle released)
		stage = "archive zip";
		try {
			Path archive = Paths.get(props.getArchiveFolder()).resolve(name);
			Files.move(zipPath, archive, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			log.info("OK {} → {} ({} debiteuren, {} specificaties)", name, archive.getFileName(), debiSize, specSize);
		} catch (Exception ex) {
			log.error("FAIL {} during {}: {}", name, stage, ex.getMessage(), ex);
			try {
				Path err = Paths.get(props.getErrorFolder()).resolve(zipPath.getFileName());
				Files.move(zipPath, err, StandardCopyOption.REPLACE_EXISTING);
				log.warn("Moved {} to error folder after failure", name);
			} catch (Exception moveEx) {
				log.error("Failed to move {} to error folder: {}", name, moveEx.getMessage(), moveEx);
			}
		}
	}

	private static ZipEntry find(ZipFile zf, java.util.function.Predicate<ZipEntry> p) {
		Enumeration<? extends ZipEntry> en = zf.entries();
		while (en.hasMoreElements()) {
			ZipEntry e = en.nextElement();
			if (!e.isDirectory() && p.test(e))
				return e;
		}
		return null;
	}

	private static Reader reader(ZipFile zf, ZipEntry e) throws IOException {
		return new BufferedReader(new InputStreamReader(zf.getInputStream(e), StandardCharsets.UTF_8));
	}

	private <T> T parseWithReader(ZipFile zf, ZipEntry entry, IOFunction<Reader, T> parser) throws IOException {
		try (Reader r = reader(zf, entry)) {
			return parser.apply(r);
		}
	}

	@FunctionalInterface
	private interface IOFunction<I, O> {
		O apply(I input) throws IOException;
	}

	private static String stripZip(String s) {
		return s.endsWith(".zip") ? s.substring(0, s.length() - 4) : s;
	}
}
