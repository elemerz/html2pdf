package nl.infomedics.invoicing.watch;

import nl.infomedics.invoicing.config.AppProperties;
import nl.infomedics.invoicing.service.ZipIngestService;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class FileWatchRunner implements ApplicationRunner {
	private static final Logger log = LoggerFactory.getLogger(FileWatchRunner.class);
	private static final String ZIP_EXTENSION = ".zip";
	private static final String MARKER_EXTENSION = ".txt";

	private final AppProperties props;
	private final ZipIngestService ingest;
	private final ThreadPoolExecutor processingExecutor;
	private final Semaphore processingPermits;
	private final int maxConcurrentProcessing;
	private volatile Thread watcherThread;
	private volatile ScheduledExecutorService fallbackScheduler;

	public FileWatchRunner(AppProperties props, ZipIngestService ingest) {
		this.props = props;
		this.ingest = ingest;
		int configured = Math.max(1, props.getConcurrentWorkers());
		this.maxConcurrentProcessing = configured;
		this.processingPermits = new Semaphore(this.maxConcurrentProcessing);
		
		// Create thread pool with bounded queue to prevent memory issues
		int queueCapacity = Math.max(props.getQueueCapacity(), this.maxConcurrentProcessing * 4);
		this.processingExecutor = new ThreadPoolExecutor(
				this.maxConcurrentProcessing,
				this.maxConcurrentProcessing,
				60L, TimeUnit.SECONDS,
				new LinkedBlockingQueue<>(queueCapacity),
				newNamedDaemonFactory("zip-processor-"),
				new ThreadPoolExecutor.CallerRunsPolicy() // If queue full, caller processes it
		);
		log.info("FileWatchRunner initialized with max {} concurrent zip processing, queue capacity: {}", 
				this.maxConcurrentProcessing, queueCapacity);
	}

	@Override
	public void run(ApplicationArguments args) throws Exception {
		Path in = Paths.get(props.getInputFolder());
		Files.createDirectories(in);
		Files.createDirectories(Paths.get(props.getArchiveFolder()));
		Files.createDirectories(Paths.get(props.getErrorFolder()));

		// Bootstrap existing marker files (cold start)
		log.info("Starting initial scan of existing marker files in {}", in);
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(in, "*" + MARKER_EXTENSION)) {
			for (Path marker : ds) {
				handleMarker(marker);
			}
		}
		log.info("Initial scan completed");

		// Start watcher thread
		watcherThread = new Thread(() -> watchFolder(in), "zip-watch");
		watcherThread.start();

		// Fallback periodic rescan
		fallbackScheduler = Executors.newSingleThreadScheduledExecutor(newNamedDaemonFactory("rescan-"));
		fallbackScheduler.scheduleAtFixedRate(() -> rescan(in), props.getPollFallbackSeconds(),
				props.getPollFallbackSeconds(), TimeUnit.SECONDS);
	}

	@PreDestroy
	public void shutdown() {
		log.info("Shutting down FileWatchRunner...");
		
		// Stop scheduled rescans
		if (fallbackScheduler != null) {
			fallbackScheduler.shutdown();
			try {
				if (!fallbackScheduler.awaitTermination(5, TimeUnit.SECONDS)) {
					fallbackScheduler.shutdownNow();
				}
			} catch (InterruptedException e) {
				fallbackScheduler.shutdownNow();
				Thread.currentThread().interrupt();
			}
		}
		
		// Stop processing executor
		processingExecutor.shutdown();
		try {
			if (!processingExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
				log.warn("Forcing shutdown of processing executor...");
				processingExecutor.shutdownNow();
			}
		} catch (InterruptedException e) {
			processingExecutor.shutdownNow();
			Thread.currentThread().interrupt();
		}
		
		// Stop watcher thread
		if (watcherThread != null && watcherThread.isAlive()) {
			watcherThread.interrupt();
		}
		log.info("FileWatchRunner shutdown complete");
	}

	private void watchFolder(Path in) {
		try (WatchService ws = FileSystems.getDefault().newWatchService()) {
			Map<WatchKey, Path> watchKeys = new HashMap<>();
			registerAllDirectories(in, ws, watchKeys);
			
			log.info("Watching {} for marker files ({} -> {})", in, MARKER_EXTENSION, ZIP_EXTENSION);
			
			while (true) {
				WatchKey key = ws.take();
				Path dir = watchKeys.get(key);
				if (dir == null) {
					key.reset();
					continue;
				}

				boolean overflowDetected = false;
				for (WatchEvent<?> ev : key.pollEvents()) {
					WatchEvent.Kind<?> kind = ev.kind();
					if (kind == StandardWatchEventKinds.OVERFLOW) {
						log.error("!!! WATCH SERVICE OVERFLOW DETECTED !!!");
						log.error("Too many file system events at once - rescanning directory: {}", dir);
						overflowDetected = true;
						break;
					}
					
					Path relative = (Path) ev.context();
					if (relative == null) {
						continue;
					}
					Path child = dir.resolve(relative);
					
					if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
						if (Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS)) {
							registerAllDirectories(child, ws, watchKeys);
							submitExistingMarkers(child);
						} else if (isMarker(child)) {
							handleMarker(child);
						}
					} else if (kind == StandardWatchEventKinds.ENTRY_MODIFY && Files.isRegularFile(child)) {
						if (isMarker(child)) {
							handleMarker(child);
						}
					}
				}

				if (overflowDetected) {
					log.error("Rescanning directory after overflow: {}", dir);
					submitExistingMarkers(dir);
				}

				boolean valid = key.reset();
				if (!valid) {
					watchKeys.remove(key);
					if (watchKeys.isEmpty()) {
						break;
					}
				}
			}
		} catch (InterruptedException ie) {
			Thread.currentThread().interrupt();
			log.info("Watcher thread interrupted");
		} catch (IOException ioe) {
			log.error("Watcher stopped due to I/O error: {}", ioe.getMessage(), ioe);
		}
	}

	private void registerAllDirectories(Path start, WatchService watchService, Map<WatchKey, Path> watchKeys) throws IOException {
		if (start == null || !Files.exists(start)) {
			return;
		}
		Files.walkFileTree(start, new SimpleFileVisitor<>() {
			@Override
			public FileVisitResult preVisitDirectory(Path dir, java.nio.file.attribute.BasicFileAttributes attrs) throws IOException {
				registerDirectory(dir, watchService, watchKeys);
				return FileVisitResult.CONTINUE;
			}

			@Override
			public FileVisitResult visitFileFailed(Path file, IOException exc) {
				log.warn("Unable to access {}: {}", file, exc.getMessage());
				return FileVisitResult.CONTINUE;
			}
		});
	}

	private void registerDirectory(Path dir, WatchService watchService, Map<WatchKey, Path> watchKeys) throws IOException {
		if (dir == null || watchKeys.containsValue(dir)) {
			return;
		}
		WatchKey key = dir.register(watchService, StandardWatchEventKinds.ENTRY_CREATE, 
				StandardWatchEventKinds.ENTRY_MODIFY);
		watchKeys.put(key, dir);
	}

	private void submitExistingMarkers(Path directory) {
		if (directory == null) {
			return;
		}
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(directory, "*" + MARKER_EXTENSION)) {
			for (Path marker : ds) {
				handleMarker(marker);
			}
		} catch (IOException e) {
			log.warn("Unable to scan directory {} for markers: {}", directory, e.getMessage());
		}
	}

	private void rescan(Path in) {
		try (DirectoryStream<Path> ds = Files.newDirectoryStream(in, "*" + MARKER_EXTENSION)) {
			for (Path marker : ds) {
				handleMarker(marker);
			}
		} catch (IOException e) {
			log.warn("Rescan failed for {}: {}", in, e.getMessage());
		}
	}

	private void handleMarker(Path marker) {
		if (!isMarker(marker)) {
			return;
		}
		try {
			processingExecutor.submit(() -> {
				boolean acquired = false;
				try {
					acquired = processingPermits.tryAcquire(30, TimeUnit.SECONDS);
					if (!acquired) {
						log.error("Unable to acquire processing permit for {} after 30 seconds", marker);
						logExecutorState();
						moveToError(marker);
						return;
					}
					processMarkerSafely(marker);
				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					log.error("Interrupted while processing {}", marker);
					moveToError(marker);
				} catch (Exception e) {
					log.error("Unexpected error processing {}: {}", marker, e.getMessage(), e);
					moveToError(marker);
				} finally {
					if (acquired) {
						processingPermits.release();
					}
				}
			});
		} catch (RejectedExecutionException e) {
			log.error("Executor rejected task for {} (queue full or shutdown)", marker);
			logExecutorState();
			moveToError(marker);
		}
	}

	private void processMarkerSafely(Path marker) {
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
				deleteMarker(marker);
				ingest.processZip(zipPath);
			} else {
				log.warn("Marker {} present but matching {} is missing", marker.getFileName(),
						zipPath.getFileName());
			}
		} catch (IOException e) {
			log.warn("Failed to handle marker {}: {}", marker.getFileName(), e.getMessage());
		}
	}

	private void logExecutorState() {
		int availablePermits = processingPermits.availablePermits();
		int queuedTasks = processingExecutor.getQueue().size();
		int activeThreads = processingExecutor.getActiveCount();
		long completedTasks = processingExecutor.getCompletedTaskCount();
		
		log.error("EXECUTOR STATE:");
		log.error("  Available permits: {}/{}", availablePermits, maxConcurrentProcessing);
		log.error("  Active threads: {}/{}", activeThreads, maxConcurrentProcessing);
		log.error("  Queued tasks: {}", queuedTasks);
		log.error("  Completed tasks: {}", completedTasks);
	}

	private void moveToError(Path marker) {
		if (marker == null) {
			return;
		}
		try {
			Path errorDir = Paths.get(props.getErrorFolder());
			Files.createDirectories(errorDir);
			Path destination = errorDir.resolve(marker.getFileName());
			Files.move(marker, destination, StandardCopyOption.REPLACE_EXISTING);
			log.info("Moved {} to error folder", marker.getFileName());
		} catch (IOException e) {
			log.error("Failed to move {} to error folder: {}", marker, e.getMessage());
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
