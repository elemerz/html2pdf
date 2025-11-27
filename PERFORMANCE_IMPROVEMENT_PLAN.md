# Performance Improvement Plan

Based on the analysis of `invoice-parser` and `pdf-creator`, the following performance improvements have been identified and implemented.

## 1. Reuse XML Factories (High Impact)
**Status: Implemented (Revised)**

*   **Problem**: `Html2PdfConverterService` was creating new instances of `DocumentBuilderFactory` and `TransformerFactory` for every single PDF conversion. These operations are expensive.
*   **Initial Attempt**: Promoted factories to static constants. This caused a performance regression, likely due to synchronization contention in `DocumentBuilderFactory` or `newDocumentBuilder()` when accessed by many threads.
*   **Revised Solution**: Implemented `ThreadLocal<DocumentBuilder>` and `ThreadLocal<Transformer>`. This avoids factory creation overhead AND eliminates contention, as each thread has its own builder/transformer.
*   **Benefit**: Reduces CPU overhead without introducing lock contention.

## 2. Optimize Reflection Caching (Medium Impact)
**Status: Implemented**

*   **Problem**: `HtmlToPdfController.resolvePropertyPlaceholders` used a local `HashMap` to cache reflection `Method` lookups. This cache was discarded after processing each invoice item.
*   **Solution**: Introduced a static `ConcurrentHashMap` (`METHOD_CACHE`) to cache method lookups globally.
*   **Benefit**: Reduces CPU usage for property resolution.

## 3. Tune Thread Pool Size (High Impact)
**Status: Reverted to Original**

*   **Problem**: The `pdf-creator` service allows up to 64 concurrent conversions.
*   **Initial Attempt**: Increased `pdfConversionExecutor` pool size to 68. This caused a massive performance regression (30%+ slowdown) due to context switching overhead, as PDF conversion is CPU-bound and the machine likely has fewer cores.
*   **Revised Solution**: Reverted `pdfConversionExecutor` to use `Runtime.getRuntime().availableProcessors()` (default behavior). This ensures active CPU tasks match the hardware capabilities, maximizing throughput.
*   **Benefit**: Prevents context switching thrashing.

## 4. Optimize Data Transfer Object (High Impact)
**Status: Implemented**

*   **Problem**: `invoice-parser` was serializing `DebiteurWithPractitioner` objects to JSON strings, wrapping them in `BatchConversionItem`, and then `pdf-creator` was deserializing them back to objects. This "double serialization" wasted CPU cycles on both ends.
*   **Solution**: Updated `BatchConversionItem` in `invoice-models` to accept `Object jsonModel` instead of `String`. Updated `invoice-parser` to pass the object directly, and `pdf-creator` to use the object directly (via Jackson's `valueToTree` if needed, or just direct mapping).
*   **Benefit**: Eliminates redundant JSON serialization/deserialization for every invoice item.

## 5. Future Improvements (Not Implemented)

*   **Avoid Repeated HTML Parsing**: Currently, the XHTML template is parsed into a DOM `Document` for every invoice. Since the template structure is largely static, parsing it once and cloning/modifying the DOM could save significant time. This requires complex refactoring of the placeholder resolution logic.
*   **Reduce JSON Overhead**: The batch API sends the full HTML template and large JSON models. Optimizing the data transfer format (e.g., sending template once, or using a more compact format) could reduce network and serialization overhead.
