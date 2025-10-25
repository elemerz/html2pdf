@echo off
REM Project Context Loader Script (Windows)
REM Run this at the start of each session to give the AI assistant full project context

echo ==========================================
echo Loading Project Context...
echo ==========================================
echo.

REM 1. Documentation files
echo Loading documentation files...
for %%f in (context.md README.md AGENTS.md feature-request.md feature-requests.txt) do (
  if exist %%f (
    echo --- %%f ---
    type %%f
    echo.
  )
)

REM 2. Package info
echo Loading package.json...
if exist package.json (
  type package.json
  echo.
)

REM 3. Key TypeScript files (first 50 lines)
echo Loading key TypeScript files...
echo.

if exist src\app\shared\models\schema.ts (
  echo --- src/app/shared/models/schema.ts ---
  powershell -Command "Get-Content 'src\app\shared\models\schema.ts' | Select-Object -First 50"
  echo ... (showing first 50 lines)
  echo.
)

if exist src\app\core\services\designer-state.service.ts (
  echo --- src/app/core/services/designer-state.service.ts ---
  powershell -Command "Get-Content 'src\app\core\services\designer-state.service.ts' | Select-Object -First 50"
  echo ... (showing first 50 lines)
  echo.
)

if exist src\app\app.ts (
  echo --- src/app/app.ts ---
  powershell -Command "Get-Content 'src\app\app.ts' | Select-Object -First 50"
  echo ... (showing first 50 lines)
  echo.
)

REM 4. Project structure
echo Project structure:
echo.
dir /s /b src\*.ts src\*.html src\*.less 2>nul | findstr /v node_modules

echo.
echo ==========================================
echo Context Loading Complete!
echo ==========================================
echo.
echo Project: HTML Report Template Designer
echo Tech Stack: Angular 20, TypeScript 5.9, Quill v2
echo Key Constraint: No position:absolute (CSS2 engine limitation)
echo.
