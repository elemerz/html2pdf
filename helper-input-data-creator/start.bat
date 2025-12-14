@echo off
REM Start the helper-input-data-creator module
REM This will continuously generate random ZIP files with presence markers

cd /d "%~dp0"

if not exist "target\helper-input-data-creator-0.0.1-SNAPSHOT.jar" (
    echo JAR file not found. Building...
    call mvn clean package -DskipTests
    if errorlevel 1 (
        echo Build failed!
        pause
        exit /b 1
    )
)

echo Starting Input Data Creator Helper...
echo Press Ctrl+C to stop
echo.

java -jar target\helper-input-data-creator-0.0.1-SNAPSHOT.jar

pause
