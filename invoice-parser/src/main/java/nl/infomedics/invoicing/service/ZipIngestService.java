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
@Getter @Setter
@Service
public class ZipIngestService {
	private static final Logger log = LoggerFactory.getLogger(ZipIngestService.class);

	private final ParseService parse;
	private final JsonAssembler json;
	private final AppProperties props;

	public ZipIngestService(ParseService parse, JsonAssembler json, AppProperties props,
			@Value("${json.output.folder}") String jsonOut, @Value("${json.pretty:false}") boolean pretty)
			throws IOException {
		this.parse = parse;
		this.json = json;
		this.props = props;
		this.jsonOutDir = Paths.get(jsonOut);
		this.jsonPretty = pretty;
		Files.createDirectories(this.jsonOutDir);
	}

	private final Path jsonOutDir;
	private final boolean jsonPretty;

	public void processZip(Path zipPath) {
		String name = zipPath.getFileName().toString();
		try (ZipFile zf = new ZipFile(zipPath.toFile(), StandardCharsets.UTF_8)) {
			ZipEntry meta = find(zf, e -> e.getName().endsWith("_Meta.txt"));
			ZipEntry debi = find(zf, e -> e.getName().endsWith("_Debiteuren.txt"));
			ZipEntry spec = find(zf, e -> e.getName().endsWith("_Specificaties.txt"));
			if (meta == null || debi == null || spec == null)
				throw new IllegalStateException("Missing expected entries in " + name);

			var metaInfo = parse.parseMeta(reader(zf, meta));
			var debiteuren = parse.parseDebiteuren(reader(zf, debi));
			var specificaties = parse.parseSpecificaties(reader(zf, spec));

			var bundle = json.assemble(metaInfo, debiteuren, specificaties);
			String jsonStr = json.stringify(bundle, jsonPretty);

// write JSON next to archive location for downstream consumers
			Path out = jsonOutDir.resolve(stripZip(name) + ".json");
			Files.writeString(out, jsonStr, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

// archive
			Path archive = Paths.get(props.getArchiveFolder()).resolve(name);
			Files.move(zipPath, archive, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			log.info("OK {} → {} ({} debiteuren, {} specificaties)", name, archive.getFileName(), debiteuren.size(),
					specificaties.size());
		} catch (Exception ex) {
			try {
				Path err = Paths.get(props.getErrorFolder()).resolve(zipPath.getFileName());
				Files.move(zipPath, err, StandardCopyOption.REPLACE_EXISTING);
			} catch (Exception ignore) {
			}
			log.error("FAIL {}: {}", name, ex.toString());
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

	private static String stripZip(String s) {
		return s.endsWith(".zip") ? s.substring(0, s.length() - 4) : s;
	}
}
