@echo off
setlocal

call clean-full.cmd
if errorlevel 1 exit /b %errorlevel%

call build.bat
if errorlevel 1 exit /b %errorlevel%
