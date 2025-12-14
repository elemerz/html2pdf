🎯 HIGH-PERFORMANCE MONOLITH ARCHITECTURE PLAN

   EXECUTIVE SUMMARY

   Your current architecture has two major bottlenecks identified via Java Flight Recorder:

     - HTTP/2 Secure Calls - TLS handshakes, serialization/deserialization, network latency
     - Folder Watcher - File system polling, marker file scanning overhead

   Target: Eliminate HTTP/2 entirely by direct in-process method calls, optimize file watching with
   event-driven architecture, and strategically combine virtual threads (for I/O) with platform
   threads (for CPU-bound work).

   -------------------------------------------------------------------------------------------------

   PHASE 1: MONOLITH MODULE CREATION

   Goal: Create unified invoice-monolith module combining all three backends

   1.1 Module Structure

     invoice-monolith/
     ├── pom.xml (inherits from Spring Boot 4.0.0 parent)
     ├── src/main/java/nl/infomedics/monolith/
     │   ├── InvoiceMonolithApplication.java (single entry point)
     │   ├── core/
     │   │   ├── UnifiedInvoiceEngine.java (orchestrator)
     │   │   └── DirectPdfService.java (replaces HTTP client)
     │   ├── parser/ (migrated from invoice-parser)
     │   │   ├── ZipIngestService.java
     │   │   ├── ParseService.java
     │   │   └── JsonAssembler.java
     │   ├── creator/ (migrated from pdf-creator)
     │   │   ├── Html2PdfConverterService.java
     │   │   └── FontRegistry.java
     │   ├── watch/
     │   │   ├── OptimizedFileWatcher.java (new high-perf watcher)
     │   │   └── BatchingFileMonitor.java (debouncing support)
     │   └── config/
     │       ├── ThreadingConfig.java (hybrid thread strategy)
     │       └── PerformanceProperties.java (unified config)
     └── src/main/resources/
         ├── application.properties
         └── templates/ (XHTML templates)

   Key Innovation: Replace Xhtml2PdfClient HTTP calls with direct DirectPdfService method
   invocations.

   -------------------------------------------------------------------------------------------------

   PHASE 2: HYBRID THREADING STRATEGY

   Goal: Maximize throughput using Java 25's virtual threads + platform threads

   2.1 Threading Architecture

     ┌─────────────────────────────────────────────────┐
     │         Virtual Thread Pool (I/O Bound)         │
     │  - File watching & marker detection             │
     │  - Zip file reading                             │
     │  - Disk I/O for PDFs                            │
     │  - Template loading                             │
     └─────────────────────────────────────────────────┘
                           ↓
     ┌─────────────────────────────────────────────────┐
     │      Platform Thread Pool (CPU Bound)           │
     │  - CSV/TSV parsing (univocity)                  │
     │  - JSON assembly                                │
     │  - XHTML rendering (OpenHTMLtoPDF)              │
     │  - PDF generation (PdfBox)                      │
     │  Pool Size: CPU_CORES * 2                       │
     └─────────────────────────────────────────────────┘

   2.2 ThreadingConfig.java Design

     @Configuration
     public class ThreadingConfig {

         // Virtual threads for I/O operations
         @Bean("ioExecutor")
         ExecutorService ioVirtualExecutor() {
             return Executors.newThreadPerTaskExecutor(
                 Thread.ofVirtual()
                     .name("io-vt-", 0)
                     .factory()
             );
         }

         // Platform threads for CPU-intensive work
         @Bean("cpuExecutor")
         ExecutorService cpuPlatformExecutor() {
             int cores = Runtime.getRuntime().availableProcessors();
             int poolSize = cores * 2; // Sweet spot for CPU-bound work
             return new ThreadPoolExecutor(
                 poolSize, poolSize,
                 60L, TimeUnit.SECONDS,
                 new LinkedBlockingQueue<>(poolSize * 4),
                 new CustomizableThreadFactory("cpu-worker-"),
                 new ThreadPoolExecutor.CallerRunsPolicy()
             );
         }

         // Work-stealing pool for parallel parsing
         @Bean("parsingExecutor")
         ExecutorService parsingExecutor() {
             return Executors.newWorkStealingPool(
                 Runtime.getRuntime().availableProcessors()
             );
         }
     }

   -------------------------------------------------------------------------------------------------

   PHASE 3: OPTIMIZED FILE WATCHER

   Goal: Replace polling-based marker file scanning with event-driven + batching

   3.1 Current Problem Analysis

     - FileWatchRunner rescans every pollFallbackSeconds (default 30s)
     - DirectoryStream crawls all .txt files even if no changes
     - Windows file locking causes retry loops (5 attempts × 100ms sleep)

   3.2 OptimizedFileWatcher Design

     @Component
     public class OptimizedFileWatcher {

         // Use high-sensitivity WatchService with overflow handling
         private final WatchService watchService;

         // Debounce marker file events (Windows creates/modifies quickly)
         private final Map<Path, ScheduledFuture<?>> pendingMarkers = new ConcurrentHashMap<>();

         // Batch processing: accumulate markers for 100ms, then process in bulk
         private final BatchingQueue<Path> markerQueue;

         public void start() {
             watchService = FileSystems.getDefault().newWatchService();

             // Register with high sensitivity
             inputDir.register(watchService,
                 new WatchEvent.Kind[]{
                     StandardWatchEventKinds.ENTRY_CREATE,
                     StandardWatchEventKinds.ENTRY_MODIFY
                 },
                 ExtendedWatchEventModifier.HIGH() // Windows-specific
             );

             // Process events with virtual threads (non-blocking)
             ioExecutor.submit(() -> processEvents());
         }

         private void processEvents() {
             while (true) {
                 WatchKey key = watchService.poll(500, TimeUnit.MILLISECONDS);
                 if (key == null) continue;

                 for (WatchEvent<?> event : key.pollEvents()) {
                     Path marker = extractPath(event);

                     // Debounce: delay processing by 100ms, reset timer if retriggered
                     pendingMarkers.compute(marker, (k, future) -> {
                         if (future != null) future.cancel(false);
                         return scheduler.schedule(
                             () -> markerQueue.offer(marker),
                             100, TimeUnit.MILLISECONDS
                         );
                     });
                 }
                 key.reset();
             }
         }
     }

   3.3 Performance Gains

     - Eliminate rescans: Only process actual file system events
     - Debouncing: Coalesce rapid marker creation/modification into single processing
     - Batch processing: Process 10-50 markers together → reduce context switching
     - Non-blocking: Virtual threads handle waiting, platform threads do real work

   -------------------------------------------------------------------------------------------------

   PHASE 4: DIRECT PDF SERVICE (HTTP ELIMINATION)

   Goal: Replace OkHttp3 client with direct method calls

   4.1 DirectPdfService Implementation

     @Service
     public class DirectPdfService {

         private final Html2PdfConverterService pdfConverter;
         private final ExecutorService cpuExecutor;

         // Direct in-process call - NO serialization, NO network, NO TLS
         public Map<String, byte[]> convertBatch(
                 String html,
                 List<BatchConversionItem> items) {

             // Process in parallel using CPU-bound platform threads
             List<CompletableFuture<Entry>> futures = items.stream()
                 .map(item -> CompletableFuture.supplyAsync(
                     () -> convertSingle(html, item),
                     cpuExecutor // Platform threads for CPU-intensive rendering
                 ))
                 .toList();

             return futures.stream()
                 .map(CompletableFuture::join)
                 .collect(Collectors.toMap(
                     Entry::key,
                     Entry::value
                 ));
         }

         private Entry convertSingle(String html, BatchConversionItem item) {
             // Direct call - zero overhead
             String resolved = resolveVariables(html, item.jsonModel());
             byte[] pdf = pdfConverter.convertHtmlToPdf(resolved).pdfContent();
             return new Entry(item.outputId(), pdf);
         }
     }

   4.2 Performance Gains Estimate

   Based on your JFR analysis, HTTP/2 calls likely consume:

     - TLS handshake: 50-200ms per connection
     - JSON serialization: 10-50ms per request (Jackson)
     - Network latency: 1-5ms (even localhost)
     - Deserialization: 10-50ms per response

   Expected savings per batch (100 invoices):

     - Old: ~7,100-30,700ms HTTP overhead
     - New: ~0ms (direct method call)
     - Gain: 7-30 seconds per 100 invoices

   -------------------------------------------------------------------------------------------------

   PHASE 5: MEMORY & RESOURCE OPTIMIZATION

   5.1 Shared Template Cache

     @Component
     public class TemplateCache {

         // Parse template ONCE, reuse for all invoices
         private final Map<Integer, ParsedTemplate> cache = new ConcurrentHashMap<>();

         record ParsedTemplate(
             String baseHtml,
             List<PlaceholderPosition> placeholders,
             RepeatBlock[] repeatBlocks
         ) {}

         // Pre-compile placeholders instead of regex scanning per invoice
         public ParsedTemplate get(int invoiceType) {
             return cache.computeIfAbsent(invoiceType, this::parse);
         }
     }

   5.2 ByteBuffer Reuse for PDF Generation

     // OpenHTMLtoPDF writes to ByteArrayOutputStream - reuse buffers
     private static final ThreadLocal<ByteArrayOutputStream> BUFFER_POOL =
         ThreadLocal.withInitial(() -> new ByteArrayOutputStream(256 * 1024));

     public byte[] renderPdf(Document doc) {
         ByteArrayOutputStream buffer = BUFFER_POOL.get();
         buffer.reset(); // Reuse buffer
         pdfBuilder.toStream(buffer);
         return buffer.toByteArray();
     }

   5.3 JVM Tuning Recommendations

     # G1GC with large heap for PDF generation
     -XX:+UseG1GC
     -Xms4g
     -Xmx8g
     -XX:MaxGCPauseMillis=200
     -XX:G1ReservePercent=15

     # Virtual thread optimizations
     -XX:+UnlockExperimentalVMOptions
     -XX:+UseVirtualThreadForTasks

     # Reduce allocation rate
     -XX:+AlwaysPreTouch
     -XX:+UseStringDeduplication

   -------------------------------------------------------------------------------------------------

   PHASE 6: CONFIGURATION & AUTO-TUNING

   6.1 Unified application.properties

     # Monolith Configuration
     monolith.threading.cpu-pool-size=0  # 0 = auto (CPU_CORES * 2)
     monolith.threading.io-pool-size=-1  # -1 = unlimited virtual threads
     monolith.threading.parsing-pool-size=0  # 0 = auto (work-stealing)

     # File watching optimization
     monolith.watch.debounce-millis=100
     monolith.watch.batch-size=50
     monolith.watch.use-native-events=true

     # PDF generation
     monolith.pdf.max-concurrent=32  # Platform threads for rendering
     monolith.pdf.enable-template-cache=true
     monolith.pdf.buffer-pool-size=128  # ByteBuffer pool

     # Performance monitoring
     monolith.metrics.enabled=true
     monolith.metrics.detailed-timing=true

   6.2 Auto-Tuning Strategy

     @Component
     public class AutoTuner {

         @Scheduled(fixedDelay = 60000) // Every minute
         public void adjustThreadPools() {
             // Monitor metrics
             double cpuUsage = getCpuUsage();
             int queueDepth = getQueueDepth();

             // Increase CPU pool if consistently high queue
             if (queueDepth > poolSize * 2 && cpuUsage < 0.8) {
                 scaleCpuPool(+2);
             }

             // Decrease if idle
             if (queueDepth == 0 && cpuUsage < 0.3) {
                 scaleCpuPool(-1);
             }
         }
     }

   -------------------------------------------------------------------------------------------------

   PHASE 7: MIGRATION STRATEGY

   7.1 Gradual Migration Path

     Week 1: Create invoice-monolith module, port models
     Week 2: Integrate parser components, add DirectPdfService
     Week 3: Port pdf-creator, implement OptimizedFileWatcher
     Week 4: Integration testing, performance benchmarking
     Week 5: Parallel deployment (old + new), A/B testing
     Week 6: Full cutover, decommission old services

   7.2 Backward Compatibility

   Keep REST endpoints for backward compatibility:

     @RestController
     @RequestMapping("/legacy-api")
     public class LegacyCompatController {

         private final DirectPdfService directService;

         // Old HTTP API still works, but routes internally
         @PostMapping("/pdf/convert-batch")
         public ResponseEntity<BatchConversionResponse> convertBatch(
                 @RequestBody BatchConversionRequest request) {

             // Direct call instead of HTTP
             Map<String, byte[]> results = directService.convertBatch(
                 request.html(),
                 request.items()
             );

             return ResponseEntity.ok(toResponse(results));
         }
     }

   -------------------------------------------------------------------------------------------------

   EXPECTED PERFORMANCE GAINS

   ┌───────────────────────┬──────────────────────┬─────────────────────┬────────────────┐
   │ Optimization          │ Baseline             │ Monolith            │ Improvement    │
   ├───────────────────────┼──────────────────────┼─────────────────────┼────────────────┤
   │ HTTP/2 Overhead       │ ~20-30s/100 invoices │ 0s                  │ ✅ Eliminated  │
   ├───────────────────────┼──────────────────────┼─────────────────────┼────────────────┤
   │ File Watch Polling    │ ~500ms per scan      │ ~10ms event-driven  │ 98% faster     │
   ├───────────────────────┼──────────────────────┼─────────────────────┼────────────────┤
   │ Template Parsing      │ Per-invoice          │ Once (cached)       │ 99% reduction  │
   ├───────────────────────┼──────────────────────┼─────────────────────┼────────────────┤
   │ Thread Context Switch │ High (50+ threads)   │ Optimized (VT + PT) │ 60% reduction  │
   ├───────────────────────┼──────────────────────┼─────────────────────┼────────────────┤
   │ Total Throughput      │ ~46 ops/s            │ ~200-300 ops/s      │ 🚀 4-6x faster │
   └───────────────────────┴──────────────────────┴─────────────────────┴────────────────┘

   -------------------------------------------------------------------------------------------------

   DECISION POINTS FOR YOU

   Before I start implementation, please decide:

     - Module Name: invoice-monolith or prefer invoice-unified / invoice-engine?
     - Threading Strategy: Accept my hybrid VT + PT design, or prefer:
       - Option A: All virtual threads (simpler, but CPU-bound work may suffer)
       - Option B: Hybrid (my recommendation)
       - Option C: Work-stealing pool only
     - File Watcher: Use my optimized event-driven design, or prefer:
       - Option A: Keep current with minor improvements
       - Option B: Full rewrite (my recommendation)
       - Option C: Third-party library (e.g., Apache Commons VFS)
     - Migration Timeline: Aggressive (4 weeks) or Conservative (8 weeks)?
     - Backward Compatibility: Keep HTTP endpoints for external clients?

   Should I proceed with PHASE 1 implementation? I'll create the monolith module skeleton with Spring
   Boot 4.0.0 + Java 25 setup.
