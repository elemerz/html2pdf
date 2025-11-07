@echo off
REM Project Context Loader Script (Windows)
REM Run this at the start of each session to give the AI assistant full project context

echo ==========================================
echo Loading Project Context...
echo ==========================================
echo.

REM 1. Documentation files
echo Loading documentation files...
for %%f in (README.cdx.md) do (
  if exist %%f (
    echo --- %%f ---
    type %%f
    echo.
  )
)

REM 2. POM info
echo Loading pom.xml...
if exist pom.xml (
  type pom.xml
  echo.
)

REM 3. Project structure (Spring Boot / Maven)
echo Project structure:
echo.

REM Top-level Maven files (if present)
if exist pom.xml echo pom.xml
REM Source files (exclude build output like target/)
dir /s /b ^
  src\main\java\*.java ^
  src\test\java\*.java ^
  src\main\resources\*.properties ^
  src\main\resources\*.xml ^
  config\*.* ^
  src\test\resources\*.properties ^
  2>nul ^
| findstr /v /i "\\target\\" ^
| findstr /v /i "\\.git\\" ^
| findstr /v /i "\\build\\"
echo.
echo ==========================================
echo Context Loading Complete!
echo ==========================================
echo.
echo Project: Invoice Parser
echo Tech Stack: Java 25 + Spring Boot 3.5.7 + Maven 3.9.x + Eclipse IDE for Java 2025.12 M2
echo.
