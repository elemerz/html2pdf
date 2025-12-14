@echo off
REM Example: Large batch with controlled pace
REM Demonstrates inter-file delay for 142 files

echo ================================================================
echo Large Batch Example: 142 Files with Controlled Pace
echo ================================================================
echo.
echo This example demonstrates generating a large batch (100-150 files)
echo with inter-file delays to control the arrival rate.
echo.
echo Configuration:
echo   - Batch size: 100-150 files
echo   - Inter-file delay: 200-500ms
echo   - Expected time: 20-75 seconds per batch
echo.
echo This simulates a realistic scenario where files don't all arrive
echo at once, but trickle in at a steady pace.
echo.
pause

cd /d "%~dp0"

if not exist "target\helper-input-data-creator-0.0.1-SNAPSHOT.jar" (
    echo Building...
    call mvn package -DskipTests -q
)

echo.
echo Starting generation...
echo Watch the [Batch: X] [Y/Z] progress indicators
echo.

java -jar target\helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.continuousMode=false ^
  --data-generator.batchMinCount=100 ^
  --data-generator.batchMaxCount=150 ^
  --data-generator.interFileDelayMinMs=200 ^
  --data-generator.interFileDelayMaxMs=500 ^
  --data-generator.outputFolder=D:\test-large-batch

echo.
echo Generation complete!
echo.
echo Files created in: D:\test-large-batch
echo.
pause

REM Optional cleanup
echo.
set /p cleanup="Delete test files? (y/n): "
if /i "%cleanup%"=="y" (
    rmdir /s /q D:\test-large-batch
    echo Test files deleted.
)
