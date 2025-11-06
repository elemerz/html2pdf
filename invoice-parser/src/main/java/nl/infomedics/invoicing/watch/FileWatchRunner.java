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

// Bootstrap existing .zip files (cold start)
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(in, "*.zip")) {
			for (Path p : ds)
				queue.offer(p);
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
			log.info("Watching {} for new .zip files", in);
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
					if (child.getFileName().toString().toLowerCase().endsWith(".zip"))
						queue.offer(child);
				}
				key.reset();
			}
		}
	}

	private static void rescan(Path in, BlockingQueue<Path> queue) {
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(in, "*.zip")) {
			for (Path p : ds)
				queue.offer(p);
		} catch (IOException e) {
			/* log once */ }
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
