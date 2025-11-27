- Keep virtual threads for request handling / file watching (blocking I/O) but:
-run the heavy OpenHTMLToPDF conversions on a bounded platform thread pool sized ≈ availableProcessors.
 (the current semaphore + common ForkJoin + virtual Tomcat combo causes blocked common-pool threads and
   wasted scheduling). 
- Replace CompletableFuture.supplyAsync(default) with an executor matching
   converter.max-concurrent (or remove semaphore and let pool size be the limit)
- Optimize converter internals by reusing preconfigured PdfRendererBuilder / ThreadLocal DocumentBuilder.
- Use precompiled regex Patterns, 
- Use caching reflection/property lookups and placeholder resolutions for repeated items.
- Consider batching identical templates (share parsed DOM)
- Preallocate ByteArrayOutputStream with estimated size.
- Switch the HttpClient pool to virtual threads or async send to reduce idle platform threads.
________________

- Right-size concurrency (avoid thrash): invoice-parser defaults to 64 zip workers (invoice-
    parser/src/main/resources/application.properties) and also limits PDF batching with a 64-permit
    semaphore in ZipIngestService. Meanwhile pdf-creator actually converts on a fixed pool sized
    to availableProcessors() (pdf-creator/.../ServerPerformanceConfiguration). Dropping the parser
    worker count and PDF permit count to availableProcessors() (or a small multiple) will cut context
    switching and queue churn when many ZIPs arrive.
  - Skip needless JSON round-trips in PDF service: HtmlToPdfController.parseDebiteur re-materializes
    the jsonModel via Jackson even when it’s already a DebiteurWithPractitioner or SingleDebtorInvoice
    from the parser. Add fast-paths to accept these types directly and only fall back to JSON parsing
    for strings; this removes a full object→tree→object conversion per invoice.
  - Avoid sanitised XHTML work when not requested: Html2PdfConverterService.convertHtmlToPdf always
    parses/serializes the DOM to produce sanitisedXhtml, but callers (batch conversion) never use
    it. Add a flag to skip DOM serialization (and possibly the DOM parse when html passthrough is
    acceptable) when includeSanitisedXhtml=false; this saves DOM-to-string transformer work per PDF.
  - Cheaper placeholder resolution: HtmlToPdfController.resolvePropertyPlaceholders uses reflection
    per placeholder and reparses repeat blocks each time. Converting the data object to a Map once
    (via convertValue) and walking that map, plus caching stripped repeat blocks per template, would
    reduce per-invoice CPU during batch runs.
  - Batch executor backpressure: HtmlToPdfController.convertBatch fans out a CompletableFuture per
    item immediately. For very large batches this floods the queue; chunking (e.g., submit in bounded
    batches equal to executor parallelism) or using a bounded semaphore would smooth load and reduce
    memory/queue overhead.