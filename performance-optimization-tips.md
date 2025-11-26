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
