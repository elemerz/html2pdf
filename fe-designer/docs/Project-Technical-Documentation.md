# Invoicing System Technical Documentation

> Status: Prototype – expect incomplete validation, limited resilience, and evolving contracts.

## 1. Executive Summary
This system transforms zipped source data into production‑ready PDF invoices. It does so by (1) designing XHTML templates (fe-designer), (2) parsing heterogeneous ZIP payloads into a normalized JSON model (invoice-parser), and (3) rendering one PDF per debtor via a multi-threaded XHTML engine (pdf-creator).

```
ZIP Archive (.txt in-scope)        fe-designer (XHTML Template Library)
            │                                   │
            ▼                                   │
     invoice-parser ── selects template by invoiceType ──► (XHTML + JSONModel)
            │                                                   │
            ▼                                                   ▼
        pdf-creator ◄── placeholder binding & rendering ── Base64 PDFs
            │
            ▼
     Output Folder (persisted files)
```

## 2. Module Overview
| Module        | Responsibility | Primary Input | Primary Output | Tech Stack | Key Risks |
|--------------|---------------|---------------|----------------|-----------|-----------|
| fe-designer  | Visual design & export of XHTML invoice templates | User interactions / schema hints | Well‑formed XHTML + template metadata | Angular 21 + Vite | Unsupported CSS, malformed XHTML |
| invoice-parser | Parse ZIP, build JSONModel, orchestrate rendering | ZIP files (.txt in-scope) | Normalized JSONModel + render requests | Java 21 (Spring Boot) | Inconsistent encodings, missing template |
| pdf-creator  | Bind data & render PDFs concurrently | XHTML + JSONModel | Base64‑encoded PDF array | Java (renderer lib) | Thread contention, font/image issues |

## 3. Core Data Contracts
### 3.1 Template
Well‑formed XHTML (strict XML syntax) + placeholders `{{ path.to.field }}`. Must avoid unsupported CSS (e.g., complex flex/grid rules if renderer lacks full compliance).

### 3.2 JSONModel (Prototype Sample)
```json
{
  "debiteur": {
    "invoiceNumber": "12300164715071",
    "printDate": "26-09-2025",
    "hcpName": "Samenwerkende Tandartsen Made",
    "hcpStreet": "Duinstraat",
    "hcpHouseNr": "6",
    "hcpZipCode": "4921EA",
    "hcpCity": "Made",
    "hcpAgb": "",
    "practiceAgb": "38000182",
    "insuredId": "12300164715071",
    "patientName": "EAM Hessels",
    "street": "Antwerpsestraat",
    "houseNr": "35",
    "zipCode": "4921DD",
    "city": "MADE",
    "patientDob": "12-02-2004",
    "invoiceAmountCents": 6035,
    "openImfCents": 2345,
    "firstExpirationDate": "19-11-2025",
    "insurer": "Centrale Verwerkingseenheid CZ: CZ,  Nationale Nederlanden en OHRA",
    "periodFrom": "2025-09-26",
    "periodTo": "2025-10-26",
    "invoiceType": 20,
    "totalsAmount": 7146
  },
  "practitioner": {
    "agbCode": "3108000099",
    "logoNr": 0,
    "address": { "country": "", "postcode": "3532BL", "street": "Lindelaan", "houseNr": "17" },
    "practice": { "name": "Tandarts Sterrenwijk", "code": "", "phone": "" }
  },
  "treatments": [
    {
      "invoiceNumber": "12300164715071",
      "date": "2023-10-25",
      "treatmentCode": "Q241",
      "description": "Perio*Aid mondspoelmiddel 0.12% chlx 500ml",
      "treatmentProvider": "38000182",
      "amountCents": "895",
      "vatIndicator": "19",
      "vatValueCents": "178"
    }
  ],
  "totaalBedrag": 71.46
}
```
XML sources are out of scope for the current prototype.

### 3.3 Render Request / Response
Request: `{ xhtmlTemplateString, jsonModel }` → Response: `{ pdfBytesBase64[] }` where length equals debtor line count (DebtorLinesCount).

## 4. Detailed Module Design
### 4.1 fe-designer
- Stack: Angular 21, Vite, TypeScript, drag‑and‑drop component canvas.
- Output discipline: Restrict CSS to renderer-supported subset; enforce XHTML (close all tags, lowercase elements, quoted attributes).
- Metadata: `invoiceType`, `version`, optional preview assets for future validation.
- Scripts: `start.(bat|sh)`, `build.(bat|sh)`, `proxy.conf.json`, `vite.config.*`.
- Pitfalls: Advanced layout features (flex/grid), remote fonts, unescaped characters in placeholders.
- Proposed Enhancements: Live preview using pdf-creator, schema-driven auto-complete for placeholders, template manifest versioning, lint step for XHTML.

### 4.2 invoice-parser
- Flow: ZIP ingest → decode text files → field extraction → JSONModel assembly → template selection → render orchestration → persist PDFs.
- Pitfalls: Memory spikes on large ZIPs; ambiguous field mapping; missing template for invoiceType; inconsistent locale/number formatting.
- Proposed Enhancements: Streaming ZIP parsing, JSON Schema validation, versioned template resolution with fallback, structured metrics (parse_time_ms, render_time_ms), configurable backpressure (queue + thread pool).

### 4.3 pdf-creator
- Pipeline: Placeholder binding (null-safe, escaped) → asset resolution (fonts/images cache) → multi-threaded rendering → Base64 encoding → return.
- Pitfalls: Non thread-safe renderer internals; missing glyphs; large images causing heap pressure; partial CSS support gaps.
- Proposed Enhancements: Precompile + cache templates, font warming, image downscaling, alternative rendering engines (Chromium / wkhtmltopdf) abstraction layer, diagnostics channel (warnings array).

## 5. Cross-Cutting Concerns
| Concern | Current State (Prototype) | Improvement Path |
|---------|---------------------------|------------------|
| Configuration | Properties/env; manual validation | Central schema + startup validation report |
| Error Handling | Ad-hoc messages | Structured error taxonomy + remediation hints |
| Security | Basic ZIP handling | Zip traversal protection, content-type & size guards |
| Observability | Limited logs | Correlation IDs, metrics, tracing (OpenTelemetry) |
| Performance | Unbounded parsing concurrency | Bounded queues, load shedding, profiling |
| Asset Management | Manual placement | Font/image registries + optimization pipeline |

## 6. Risks & Pitfalls Summary
1. Data variability → parse failures / incorrect JSONModel.
2. Template mismatch or invalid XHTML → render aborts.
3. Renderer feature gaps → layout regressions.
4. Concurrency oversubscription → memory/CPU exhaustion.
5. Windows path handling errors (backslash consistency).
6. Lack of versioning → silent incompatibilities between JSONModel and templates.

## 7. Improvement Roadmap (Prioritized)
1. Contract Formalization: JSON Schema + template manifest (version, invoiceType, rendererCapabilities).
2. Preview Pipeline: Reuse pdf-creator engine in fe-designer for real-time validation.
3. Streaming & Validation: Incremental ZIP parsing with early rejection and memory ceilings.
4. Observability Foundation: Structured logging + metrics + correlation IDs.
5. Rendering Abstraction: Interface allowing multiple backends (current engine, Chromium) with capability negotiation.
6. Performance & Load Testing: JMH microbenchmarks + scenario-based load tests.
7. Security Hardening: ZIP sandboxing, path sanitization, dependency scanning (OWASP).
8. Asset Optimization: Font subset generation, image compression (PNG/SVG optimization).

## 8. Future Features (Backlog)
- Real database persistence (audit & history).
- Securize the API.
- Template versioning & migration tooling.
- Custom component library (headers, line item tables, totals blocks).
- Logo/image management + optimization pipeline.
- Custom font management & fallback strategy.
- Nested template repetition (e.g., treatment groups, attachments).
- Unit & integration test suites (parser, renderer, template lint).
- Performance harness (JMH) & visual regression (pixel/DOM diff of PDFs).
- Enterprise scalability: horizontal workers, work queue, distributed cache.
- Structured logging + metrics + tracing across all modules.

## 9. Operational Guidelines
### Local Development
- fe-designer: `npm ci && npm run start` for rapid template iteration.
- invoice-parser: Configure `inputFolder` / `outputFolder`; drop sample ZIPs; monitor logs.
- pdf-creator: Run isolated rendering tests with representative XHTML + JSONModel samples.

### Testing Strategy
| Layer | Goal | Tooling |
|-------|------|---------|
| Unit | Deterministic field extraction & placeholder binding | JUnit / Jasmine |
| Integration | End-to-end ZIP→PDF correctness | Spring Boot tests + sample fixtures |
| Visual | Layout consistency | PDF rendering baseline snapshots |
| Performance | Throughput & latency envelopes | JMH + load scripts |

### Deployment
Containerize modules independently; expose rendering via internal API or message bus; externalize configuration; automate health checks (template cache warm, font availability, disk space).

## 10. Security & Compliance Checklist (Initial)
- [ ] ZIP traversal prevention (normalize & block ".." entries)
- [ ] Size & count limits per ZIP
- [ ] Input encoding normalization (UTF-8)
- [ ] Placeholder injection safety (HTML entity escaping)
- [ ] Dependency vulnerability scanning
- [ ] Logged correlation IDs (no PII in logs)

## 11. Glossary
| Term | Definition |
|------|------------|
| Debtor | Entity for which an individual PDF invoice is generated |
| JSONModel | Normalized representation of parsed invoice data |
| Placeholder | Token within XHTML replaced by runtime values (e.g., `{{ debiteur.invoiceNumber }}`) |
| Manifest | Metadata object describing a template (type, version, capabilities) |

## 12. Summary
The prototype establishes clear separation of concerns but lacks formal contracts, validation depth, and operational robustness. Prioritizing contract formalization, preview rendering, and observability will yield the highest risk reduction early. The outlined roadmap guides evolution toward a production-grade, scalable invoicing platform.
