# AGENTS.md
## Setup
- Install deps: `npm ci`
- Build frontend: `npm run build`
- Start frontend: `npm run start`
- Start backend: `./gradlew bootRun`

## Conventions
- Angular 20, strict TS; use standalone components.
- Spring Boot 3, Java 21; prefer Java records for DTOs.
- Tests: `npm run test -- --watch=false` and `./gradlew test`
