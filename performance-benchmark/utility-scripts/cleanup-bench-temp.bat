@echo off
echo Cleaning up JMH temporary folders...
powershell -Command "Get-ChildItem -Path $env:TEMP -Filter 'jmh-invoice-bench*' -Directory | Remove-Item -Recurse -Force"
echo Cleanup complete.