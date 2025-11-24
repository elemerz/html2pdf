@echo off
SETLOCAL ENABLEEXTENSIONS

echo.
echo ================================
echo FULL CLEAN for Angular Project
echo ================================

:: Step 0: Navigate up one level from config-dev to project root
::cd /d "%~dp0.."

:: Step 1: Stop node-related processes (if needed)
echo Stopping node-related processes...
taskkill /F /IM node.exe >nul 2>&1

:: Step 2: Delete node_modules
echo Deleting node_modules...
IF EXIST node_modules (
    rmdir /s /q node_modules
)

:: Step 3: Delete package-lock.json
echo Deleting package-lock.json...
IF EXIST package-lock.json (
    del /f /q package-lock.json
)

:: Step 4: Delete build and cache folders
echo Deleting dist/, out-tsc/, coverage/, tmp/, .turbo, .nx, .angular...
FOR %%F IN (dist out-tsc coverage tmp .turbo .nx .angular) DO (
    IF EXIST %%F (
        rmdir /s /q %%F
    )
)

:: Step 5: Delete Angular CLI cache in user profile
echo Deleting global Angular cache folder...
IF EXIST "%USERPROFILE%\.angular" (
    rmdir /s /q "%USERPROFILE%\.angular"
)

:: Step 6: Clean npm cache
echo Cleaning npm cache...
npm cache clean --force

:: Step 7: Delete .eslintcache
echo Deleting .eslintcache...
IF EXIST .eslintcache (
    del /f /q .eslintcache
)

echo.
echo ✅ Angular project has been FULLY cleaned.
echo ================================

ENDLOCAL
pause
