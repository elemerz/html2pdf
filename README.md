# HTML2PDF Backend

## Overview
Spring Boot 3.5 service that turns designer-produced XHTML/HTML reports into production-ready PDF files.
OpenHTMLtoPDF performs the rendering, ZXing powers QR and 1D barcode generation, and custom fonts are
loaded from bundled resources.

## Key Features
- Watches a configurable input directory for presence-marker `.txt` files and processes the matching `.xhtml` or `.html`.
- Streams PDF output to the configured destination, deleting processed inputs or moving failures aside.
- Supports QR codes and multiple barcode formats through `QrBarcodeObjectFactory`.
- Registers embedded fonts automatically via `FontRegistry` so reports can rely on project-scoped typography 
  (like Roboto, KixBarcode).
- Runs conversions on Java virtual threads and can execute a warm-up render to prime caches.
- Optional debug mode captures the post-processed XHTML alongside each generated PDF.

## Processing Workflow
1. An `.xhtml`/`.html` report and a presence-marker file with the same basename (but `.txt` extension) are dropped into `input.path.html`.
2. The marker triggers the watcher; the service parses the markup, enriches `<object>` tags for QR/barcodes, and hands it to OpenHTMLtoPDF.
3. The generated PDF is written to `output.path.pdf`. Successful runs remove the source/maker files; failures move both into `failed.path.pdf`.

## Configuration (`src/main/resources/application.properties`)
- `input.path.html`: directory to monitor for presence-marker files (default `/home/ezagoni/html`).
- `output.path.pdf`: destination directory for generated PDFs.
- `failed.path.pdf`: quarantine location for inputs that fail conversion.
- `warmup.html`: optional inline XHTML rendered during startup to warm caches.
- `debug`: when `true`, writes `<basename>-intermediate.xhtml` next to each PDF for inspection.

## Sample Assets
- Fonts: `src/main/resources/fonts/` contains sample fonts (e.g., `Roboto-Regular.ttf`, `KIXBarcode.ttf`) automatically registered.
- HTML templates: `src/main/resources/html/` holds demonstration reports including QR, barcode, inline images, SVG, and multi-page layouts.

## Running Locally
1. Ensure Java 21+ and Maven 3.9+ are available.
2. Build without tests: `mvn clean install -DskipTests` (see `build.sh`).
3. Run the packaged jar: `java -jar target/html2pdf-0.0.1-SNAPSHOT.jar` (see `start.sh`) or launch directly with `mvn spring-boot:run`.
4. Update `application.properties` or provide environment overrides to point the watcher directories at accessible paths before starting.

## Project Structure Highlights
- `src/main/java/nl/infomedics/reporting/ReportingApplication.java`: Spring Boot entry point that boots the watcher.
- `src/main/java/nl/infomedics/reporting/service/Html2PdfConverterService.java`: orchestrates folder watching, parsing, conversion, warm-up, and error handling.
- `src/main/java/nl/infomedics/reporting/service/QrBarcodeObjectFactory.java`: prepares `<object>` nodes so OpenHTMLtoPDF can render ZXing-based QR/barcodes.
- `src/main/java/nl/infomedics/reporting/service/FontRegistry.java`: discovers fonts under `classpath:/fonts/**` and registers aliases with the renderer.
- `src/main/resources/application.properties`: default configuration; adjust for your environment.
- `re.sh`: convenience script that rebuilds and restarts the service in one step.
## Stats
30 Threads, 5000 XHTML-s => 81 seconds
50 Threads, 5000 XHTML-s => 75 seconds
75 Threads, 5000 XHTML-s => 76 seconds
100 Threads, 5000 XHTML-s => 83 seconds
200 Threads, 5000 XHTML-s => 78 seconds
