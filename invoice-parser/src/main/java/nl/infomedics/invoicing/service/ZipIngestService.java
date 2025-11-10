package nl.infomedics.invoicing.service;

import nl.infomedics.invoicing.config.AppProperties;
import nl.infomedics.invoicing.model.MetaInfo;
import nl.infomedics.invoicing.model.Practitioner;
import jakarta.annotation.PreDestroy;
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
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
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

	private final Path jsonOutDir;
	private final Path pdfOutDir;
	private final boolean jsonPretty;
	private final Xhtml2PdfClient pdfClient;
	private final ThreadPoolExecutor pdfConversionExecutor;
	private final Semaphore pdfConversionPermits;
	private final int maxConcurrentPdfConversions;

	public ZipIngestService(ParseService parse, JsonAssembler json, AppProperties props, Xhtml2PdfClient pdfClient,
			@Value("${json.output.folder}") String jsonOut, @Value("${json.pretty:false}") boolean pretty,
			@Value("${pdf.output.folder:C:/invoice-data/_pdf}") String pdfOut,
			@Value("${pdf.max-concurrent-conversions:64}") int maxConcurrentPdfConversions)
			throws IOException {
		this.parse = parse;
		this.json = json;
		this.props = props;
		this.pdfClient = pdfClient;
		this.jsonOutDir = Paths.get(jsonOut);
		this.pdfOutDir = Paths.get(pdfOut);
		this.jsonPretty = pretty;
		this.maxConcurrentPdfConversions = Math.max(1, maxConcurrentPdfConversions);
		this.pdfConversionPermits = new Semaphore(this.maxConcurrentPdfConversions);
		
		// Create thread pool for PDF conversions with bounded queue
		int queueCapacity = this.maxConcurrentPdfConversions * 4;
		this.pdfConversionExecutor = new ThreadPoolExecutor(
				this.maxConcurrentPdfConversions,
				this.maxConcurrentPdfConversions,
				60L, TimeUnit.SECONDS,
				new LinkedBlockingQueue<>(queueCapacity),
				r -> {
					Thread thread = new Thread(r);
					thread.setName("pdf-conversion-worker-" + thread.getId());
					thread.setDaemon(false);
					return thread;
				},
				new ThreadPoolExecutor.CallerRunsPolicy()
		);
		
		Files.createDirectories(this.jsonOutDir);
		Files.createDirectories(this.pdfOutDir);
		log.info("ZipIngestService initialized with max {} concurrent PDF conversions, queue capacity: {}", 
				this.maxConcurrentPdfConversions, queueCapacity);
	}

	@PreDestroy
	public void shutdown() {
		log.info("Shutting down ZipIngestService...");
		pdfConversionExecutor.shutdown();
		try {
			if (!pdfConversionExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
				log.warn("Forcing shutdown of PDF conversion executor...");
				pdfConversionExecutor.shutdownNow();
			}
		} catch (InterruptedException e) {
			pdfConversionExecutor.shutdownNow();
			Thread.currentThread().interrupt();
		}
		log.info("ZipIngestService shutdown complete");
	}

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

			// --- Generate PDFs for each debtor (one PDF per debtor) ---
			Integer type = metaInfo!=null?metaInfo.getInvoiceType():null;
			if (type != null && bundle.getDebiteuren() != null && !bundle.getDebiteuren().isEmpty()) {
				generatePdfsPerDebtor(name, type, metaInfo, practitioner, bundle.getDebiteuren());
			} else {
				log.warn("PDF generation skipped for {}: invoiceType={}, debtorCount={}", 
					name, type, bundle.getDebiteuren()!=null?bundle.getDebiteuren().size():0);
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

	private void generatePdfsPerDebtor(String zipName, Integer invoiceType, MetaInfo metaInfo, 
	                                     Practitioner practitioner, List<nl.infomedics.invoicing.model.DebiteurWithPractitioner> debiteuren) {
		String stage = "load template";
		try {
			String templateHtml = loadTemplateHtml(invoiceType);
			log.info("Loaded template for type {} ({} bytes) for {} with {} debtors", invoiceType, templateHtml.length(), zipName, debiteuren.size());
			
			stage = "prepare batch items";
			List<Xhtml2PdfClient.BatchItem> batchItems = new ArrayList<>();
			for (nl.infomedics.invoicing.model.DebiteurWithPractitioner debtor : debiteuren) {
				try {
					String debtorJson = json.stringifySingleDebtor(new nl.infomedics.invoicing.model.SingleDebtorInvoice(debtor), false);
					String outputId = sanitizeFilename(debtor.getInvoiceNumber() != null ? 
						debtor.getInvoiceNumber() : debtor.getInsuredId());
					batchItems.add(new Xhtml2PdfClient.BatchItem(debtorJson, outputId));
				} catch (Exception e) {
					log.error("Failed to prepare batch item for debtor {} in {}: {}", 
						debtor.getInvoiceNumber(), zipName, e.getMessage(), e);
				}
			}
			
			if (batchItems.isEmpty()) {
				log.warn("No batch items prepared for {}", zipName);
				return;
			}
			
			stage = "submit batch conversion";
			submitBatchPdfConversion(zipName, batchItems, templateHtml);
			
		} catch (Exception ex) {
			log.error("PDF generation FAILED for {} at stage '{}': {}", zipName, stage, ex.getMessage(), ex);
		}
	}

	private void submitBatchPdfConversion(String zipName, List<Xhtml2PdfClient.BatchItem> batchItems, String templateHtml) { // templateHtml propagated
		try {
			pdfConversionExecutor.submit(() -> {
				boolean acquired = false;
				try {
					acquired = pdfConversionPermits.tryAcquire(30, TimeUnit.SECONDS);
					if (!acquired) {
						log.error("Unable to acquire PDF conversion permit for {} after 30 seconds", zipName);
						logPdfExecutorState();
						return;
					}
					convertBatchPdfs(zipName, new TemplateBatch(templateHtml, batchItems)); // use loaded templateHtml
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					log.error("Interrupted while converting PDFs for {}", zipName);
				} catch (Exception e) {
					log.error("Unexpected error during batch PDF conversion for {}: {}", zipName, e.getMessage(), e);
				} finally {
					if (acquired) {
						pdfConversionPermits.release();
					}
				}
			});
		} catch (RejectedExecutionException e) {
			log.error("PDF conversion executor rejected batch task for {} (queue full or shutdown)", zipName);
			logPdfExecutorState();
		}
	}

	private void convertBatchPdfs(String zipName, TemplateBatch batch) {
		try {
			log.info("Converting {} PDFs for {}", batch.items().size(), zipName);
			Map<String, byte[]> results = pdfClient.convertBatch(batch.html(), false, batch.items());
			
			String baseFileName = stripZip(zipName);
			int successCount = 0;
			for (Map.Entry<String, byte[]> entry : results.entrySet()) {
				try {
					Path pdfOut = pdfOutDir.resolve(baseFileName + "_" + entry.getKey() + ".pdf");
					Files.write(pdfOut, entry.getValue(), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
					successCount++;
				} catch (Exception e) {
					log.error("Failed to write PDF for debtor {} in {}: {}", entry.getKey(), zipName, e.getMessage(), e);
				}
			}
			log.info("Successfully wrote {}/{} PDFs for {}", successCount, batch.items().size(), zipName);
			
		} catch (Xhtml2PdfClient.ConversionException e) {
			log.error("Batch PDF conversion FAILED for {}: {}", zipName, e.getMessage(), e);
		}
	}

	private String sanitizeFilename(String name) {
		if (name == null || name.isEmpty()) return "unknown";
		return name.replaceAll("[^a-zA-Z0-9._-]", "_");
	}

	private void logPdfExecutorState() {
		int availablePermits = pdfConversionPermits.availablePermits();
		int queuedTasks = pdfConversionExecutor.getQueue().size();
		int activeThreads = pdfConversionExecutor.getActiveCount();
		long completedTasks = pdfConversionExecutor.getCompletedTaskCount();
		
		log.error("PDF EXECUTOR STATE:");
		log.error("  Available permits: {}/{}", availablePermits, maxConcurrentPdfConversions);
		log.error("  Active threads: {}/{}", activeThreads, maxConcurrentPdfConversions);
		log.error("  Queued tasks: {}", queuedTasks);
		log.error("  Completed tasks: {}", completedTasks);
	}

	@FunctionalInterface
	private interface IOFunction<I, O> {
		O apply(I input) throws IOException;
	}

	private static String stripZip(String s) {
		return s.endsWith(".zip") ? s.substring(0, s.length() - 4) : s;
	}

	private String loadTemplateHtml(Integer invoiceType) throws IOException {
		String templateName = "templates/for-pdf/factuur-" + invoiceType + ".html";
		return new String(Objects.requireNonNull(getClass().getClassLoader().getResourceAsStream(templateName))
				.readAllBytes(), StandardCharsets.UTF_8);
	}
}
