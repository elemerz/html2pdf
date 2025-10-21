@echo off
setlocal

ng build
if errorlevel 1 exit /b %errorlevel%

timeout /T 2 >nul

ng start
if errorlevel 1 exit /b %errorlevel%
