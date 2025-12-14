@echo off
REM Demo script to test both new features:
REM 1. Enhanced logging with batch count
REM 2. Property auto-reload without restart

echo ========================================
echo Helper Input Data Creator - Feature Demo
echo ========================================
echo.

cd /d "%~dp0"

REM Ensure it's built
if not exist "target\helper-input-data-creator-0.0.1-SNAPSHOT.jar" (
    echo Building module...
    call mvn package -DskipTests -q
    if errorlevel 1 (
        echo Build failed!
        pause
        exit /b 1
    )
)

echo Creating test output directory...
mkdir D:\test-helper-demo 2>nul

echo.
echo ========================================
echo Starting helper in continuous mode...
echo ========================================
echo.
echo FEATURES TO OBSERVE:
echo 1. Enhanced Logging: Watch for [Batch: X] [Y/Z] prefixes
echo 2. Property Auto-Reload: Enabled - watching application.properties
echo.
echo WHAT TO DO:
echo 1. Let it generate 1-2 batches
echo 2. Edit src\main\resources\application.properties
echo 3. Change data-generator.batchMaxCount from 5 to 2
echo 4. Save the file
echo 5. Watch for "Properties reloaded successfully" message
echo 6. Observe next batch will have max 2 files
echo.
echo Press Ctrl+C to stop when done
echo ========================================
echo.

java -jar target\helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.outputFolder=D:\test-helper-demo ^
  --data-generator.delayMinMs=5000 ^
  --data-generator.delayMaxMs=7000

echo.
echo Demo stopped.
pause
