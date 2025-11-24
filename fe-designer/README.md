# Report Template Designer

This Angular 20 application provides a drag-and-drop editor for composing printable HTML report templates. Designers can place layout tables, nest sub-tables up to five levels deep, edit rich text via a Quill-powered dialog, and export the result as XHTML or JSON for further processing.

## Requirements

- Node.js 20+
- npm 10+
- Java 21 (required for the Spring Boot backend)

## Getting Started

Install dependencies:

```bash
npm ci
```

Start the frontend dev server:

```bash
npm run start
```

Start the Spring Boot backend (from the project root):

```bash
./gradlew bootRun
```

The frontend proxies API requests to the backend using `proxy.conf.json` during development.

## Scripts

- `npm run start` – runs Vite in dev mode with HMR.
- `npm run build` – produces an optimized production build in `dist/`.
- `npm run test -- --watch=false` – executes Angular unit tests once.

## Testing Backend

Run backend unit tests with:

```bash
./gradlew test
```

## Project Structure Highlights

- `src/app/designer` – canvas, table rendering, and editing UI.
- `src/app/layout` – application chrome (menus, toolbars, dialogs).
- `src/app/core/services` – shared state management, API clients, and resource loaders.
- `src/app/shared` – reusable dialogs, models, and utilities.

## Export & Import

- **Export XHTML** – generates printable markup honoring table roles (`header`, `report-body`, `footer`).
- **Save Design** – creates a JSON snapshot you can re-import later.
- **Import XHTML/JSON** – the menu supports importing previously exported layouts or designs.

## Screen Calibration

Use the *Calibrate Screen* option in the menu to adjust canvas scaling so on-screen measurements match physical millimeters. The calibration scale is stored in `localStorage` and reused on subsequent sessions.
