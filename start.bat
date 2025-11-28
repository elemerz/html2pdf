@echo off
SETLOCAL
IF DEFINED JAVA_HOME25 (
    SET JAVA_HOME=%JAVA_HOME25%
)

echo Starting PDF Creator...
start "PDF Creator" cmd /c "cd pdf-creator && start.bat"

timeout /t 5

echo Starting Invoice Parser...
start "Invoice Parser" cmd /c "cd invoice-parser && start.bat"

echo Services started in separate windows.