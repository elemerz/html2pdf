# Performance Improvement Report

## 1. Implemented Improvement
**Optimization:** Removed unnecessary object-to-Map conversion in `HtmlToPdfController`.
**Impact:**
- **Baseline Score:** 22.18 ops/s
- **New Score:** 46.38 ops/s
- **Improvement:** ~109% increase in throughput.

**Details:**
The `HtmlToPdfController` was converting the entire `DebiteurWithPractitioner` object graph into a `Map<String, Object>` using Jackson for *every single invoice* to resolve placeholders. This was extremely CPU and memory intensive. I modified the code to use the object directly, leveraging the existing reflection-based `invokeProperty` mechanism which caches method handles.

**Benchmark Verification:**
I modified `InvoiceSystemBenchmark.java` to ensure it measures the **end-to-end** process. The benchmark now waits until all expected PDF files are physically created in the output directory before marking an operation as complete. This guarantees that the measured throughput reflects the full processing pipeline (Zip Ingest -> Parsing -> PDF Generation -> File Write).

## 2. Measurement Plan
To verify future improvements, follow this cycle:
1.  **Baseline:** Run `./performance-benchmark/check-health.sh` and record the "Health Check Score".
2.  **Implement:** Apply your code changes.
3.  **Build & Restart:** Rebuild the modified modules and restart the services (especially `pdf-creator` if changed).
4.  **Verify:** Run `./performance-benchmark/check-health.sh` again.
5.  **Compare:** A higher score indicates improvement.

## 3. Identifying Bottlenecks
To find where performance issues lie:

### A. Use JMH Profilers
The benchmark jar has built-in profiling capabilities. Run the benchmark with profiling enabled:
```bash
cd performance-benchmark
java -jar target/benchmarks.jar -prof stack -wi 0 -i 1 -f 1
```
This will output a stack trace analysis showing where the CPU spends the most time.

### B. Analyze Application Logs
The `pdf-creator` logs detailed timing for PDF conversions:
- Look for "Conversion time: X ms" in the logs.
- Look for "Active conversions: X/Y" to see if the thread pool is saturated.

### C. Enable Metrics
The project includes Micrometer. Configure a metrics exporter (like Prometheus) in `application.properties` to visualize:
- `jvm.memory.used`
- `jvm.gc.pause`
- Custom metrics like `activeConversions` in `Html2PdfConverterService`.

## 4. Further Improvement Possibilities (Ranked)

1.  **Optimize Placeholder Resolution (High Gain):**
    The `resolvePropertyPlaceholders` method still scans the entire HTML string for `${...}` patterns for every invoice. For large templates, this is slow.
    *   **Strategy:** Parse the template *once* to identify placeholder positions, then use a specialized replacer instead of regex/string searching.

2.  **Reuse PdfRendererBuilder (Medium Gain):**
    `Html2PdfConverterService` creates a new `PdfRendererBuilder` and registers fonts for every PDF.
    *   **Strategy:** Reuse a prototype builder or cache the font registration to avoid I/O and initialization overhead per request.

3.  **Parallel Zip Processing (Medium Gain):**
    `ZipIngestService` processes zip files sequentially.
    *   **Strategy:** Use a thread pool to process multiple zip files in parallel, especially if the system handles many small zips.

4.  **Reduce HTTP Overhead (Low/Medium Gain):**
    The communication between `invoice-parser` and `pdf-creator` is over HTTP.
    *   **Strategy:** If they are co-located, consider using a shared library approach or gRPC for lower latency.
