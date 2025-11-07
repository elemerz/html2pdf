package nl.infomedics.invoicing.watch;

import nl.infomedics.invoicing.config.AppProperties;
import nl.infomedics.invoicing.service.ZipIngestService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class FileWatchRunner implements ApplicationRunner {
	private static final Logger log = LoggerFactory.getLogger(FileWatchRunner.class);
	private static final String ZIP_EXTENSION = ".zip";
	private static final String MARKER_EXTENSION = ".txt";

	private final AppProperties props;
	private final ZipIngestService ingest;

	public FileWatchRunner(AppProperties props, ZipIngestService ingest) {
		this.props = props;
		this.ingest = ingest;
	}

	@Override
	public void run(ApplicationArguments args) throws Exception {
		Path in = Paths.get(props.getInputFolder());
		Files.createDirectories(in);
		Files.createDirectories(Paths.get(props.getArchiveFolder()));
		Files.createDirectories(Paths.get(props.getErrorFolder()));

// Work queue + worker pool for IO-bound tasks
		BlockingQueue<Path> queue = new ArrayBlockingQueue<>(props.getQueueCapacity());
		ExecutorService vpool = Executors.newFixedThreadPool(props.getConcurrentWorkers(),
				newNamedDaemonFactory("zip-"));

// Bootstrap existing marker files (cold start)
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(in, "*" + MARKER_EXTENSION)) {
			for (Path marker : ds) {
				handleMarker(marker, queue);
			}
		}

// Consumers
		for (int i = 0; i < props.getConcurrentWorkers(); i++) {
			vpool.submit(() -> {
				while (true) {
					Path p = queue.take();
					ingest.processZip(p);
				}
			});
		}

// Watcher
		try (WatchService ws = FileSystems.getDefault().newWatchService()) {
			in.register(ws, StandardWatchEventKinds.ENTRY_CREATE, StandardWatchEventKinds.OVERFLOW);
			log.info("Watching {} for marker files ({} ➜ {})", in, MARKER_EXTENSION, ZIP_EXTENSION);
			ScheduledExecutorService fallback = Executors.newSingleThreadScheduledExecutor();
			fallback.scheduleAtFixedRate(() -> rescan(in, queue), props.getPollFallbackSeconds(),
					props.getPollFallbackSeconds(), TimeUnit.SECONDS);

			while (true) {
				WatchKey key = ws.take();
				for (WatchEvent<?> ev : key.pollEvents()) {
					if (ev.kind() == StandardWatchEventKinds.OVERFLOW) {
						rescan(in, queue);
						continue;
					}
					@SuppressWarnings("unchecked")
					WatchEvent<Path> wev = (WatchEvent<Path>) ev;
					Path child = in.resolve(wev.context());
					if (isMarker(child))
						handleMarker(child, queue);
				}
				key.reset();
			}
		}
	}

	private static void rescan(Path in, BlockingQueue<Path> queue) {
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(in, "*" + MARKER_EXTENSION)) {
			for (Path marker : ds) {
				handleMarker(marker, queue);
			}
		} catch (IOException e) {
			/* log once */ }
	}

	private static void handleMarker(Path marker, BlockingQueue<Path> queue) {
		if (!isMarker(marker)) {
			return;
		}
		try {
			if (!Files.exists(marker)) {
				return;
			}
			long size = Files.size(marker);
			if (size != 0L) {
				log.warn("Marker {} ignored because it is not empty ({} bytes)", marker.getFileName(), size);
				return;
			}
			Path zipPath = toZipSibling(marker);
			if (Files.exists(zipPath)) {
				boolean enqueued = queue.offer(zipPath);
				if (enqueued) {
					deleteMarker(marker);
				} else {
					log.warn("Work queue full; keeping marker {} for retry", marker.getFileName());
				}
			} else {
				log.warn("Marker {} present but matching {} is missing", marker.getFileName(),
						zipPath.getFileName());
			}
		} catch (IOException e) {
			log.warn("Failed to handle marker {}: {}", marker.getFileName(), e.getMessage());
		}
	}

	private static boolean isMarker(Path path) {
		String name = path.getFileName().toString().toLowerCase();
		return name.endsWith(MARKER_EXTENSION);
	}

	private static Path toZipSibling(Path marker) {
		String markerName = marker.getFileName().toString();
		String baseName = markerName.substring(0, markerName.length() - MARKER_EXTENSION.length());
		return marker.resolveSibling(baseName + ZIP_EXTENSION);
	}

	private static void deleteMarker(Path marker) {
		// Windows can keep a just-created empty file locked briefly; retry a few times.
		for (int i = 0; i < 5; i++) {
			try {
				Files.deleteIfExists(marker);
				return; // success
			} catch (IOException e) {
				if (i == 4) {
					log.warn("Unable to delete marker {} after enqueue: {}", marker.getFileName(), e.getMessage());
				} else {
					try { Thread.sleep(100); } catch (InterruptedException ignored) { /* ignore */ }
				}
			}
		}
	}

	private static ThreadFactory newNamedDaemonFactory(String prefix) {
		AtomicInteger counter = new AtomicInteger();
		return runnable -> {
			Thread t = new Thread(runnable);
			t.setName(prefix + counter.getAndIncrement());
			t.setDaemon(true);
			return t;
		};
	}
}
