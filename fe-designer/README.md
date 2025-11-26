# Report Template Designer (Prototype)

Angular 21-based drag-and-drop editor for composing printable XHTML invoice templates. It outputs well‑formed XHTML and JSON design snapshots, intended for consumption by the invoice-parser and pdf-creator modules.

## Requirements
- Node.js 20+
- npm 10+
- Java 25 (for Spring Boot backend used in development)

## Getting Started
Install dependencies:
```bash
npm ci
```
Start the frontend dev server:
```bash
npm run start
```
Start the Spring Boot backend (from project root):
```bash
./gradlew bootRun
```
The frontend proxies API requests via `proxy.conf.json` during development.

## Scripts
- `npm run start` – Vite dev mode with HMR.
- `npm run build` – production build in `dist/`.
- `npm run test -- --watch=false` – run Angular unit tests once.

## Project Structure Highlights
- `src/app/designer` – canvas, table rendering, editing UI.
- `src/app/layout` – menus, toolbars, dialogs.
- `src/app/core/services` – state management, API clients, resource loaders.
- `src/app/shared` – reusable dialogs, models, utilities.

## Template Guidelines
- XHTML only: well‑formed XML (all tags closed, quoted attributes, lowercase elements).
- Use a conservative CSS subset for PDF rendering; avoid complex flex/grid that may not be supported.
- Placeholders: `{{ path.to.field }}` mapped to JSONModel fields.
- Assets: Prefer local fonts/images; ensure resolvable paths.

## Export & Import
- **Export XHTML** – printable markup honoring table roles (`header`, `report-body`, `footer`).
- **Save Design** – JSON snapshot that can be re‑imported.
- **Open JSON** – open previously-saved designs.

## Screen Calibration
Use the Calibrate Screen option to align on‑screen measurements with physical millimeters. Scale is stored in `localStorage` and reused.

## Known Limitations
- Prototype status: limited validation and error handling.
- XML input parsing is out of scope; focus on `.txt` sources.
- CSS support may differ from browsers; verify via end‑to‑end preview.

## Related Docs
See `docs\Project-Technical-Documentation.md` for architecture, contracts, and roadmap.
