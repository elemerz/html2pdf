@echo off
REM Quick Diagnostic for Invoice Engine

echo =========================================
echo Invoice Engine - Diagnostic Check
echo =========================================
echo.

echo Checking configuration...
echo.
findstr /C:"engine.input.folder" src\main\resources\application.properties
echo.

echo Checking folders...
echo.
if exist "C:\_invoice-data\_input" (
    echo [OK] Input folder exists: C:\_invoice-data\_input
    dir /b "C:\_invoice-data\_input\*.txt" 2>nul
    if errorlevel 1 (
        echo [WARNING] No marker files found
    ) else (
        echo [OK] Marker files found
    )
) else (
    echo [ERROR] Input folder missing: C:\_invoice-data\_input
)
echo.

echo Checking if application is running...
netstat -an | findstr ":5959" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Application running on port 5959
) else (
    echo [WARNING] Application not running
    echo Run: start.bat
)
echo.

echo To test processing:
echo 1. Stop the application (Ctrl+C)
echo 2. Run: mvn compile
echo 3. Run: start.bat
echo 4. Watch console for: "Processing zip: ACC_CMIB..."
echo.

pause
