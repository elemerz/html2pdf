@echo off
SETLOCAL
IF DEFINED JAVA_HOME25 (
    SET JAVA_HOME=%JAVA_HOME25%
)
SET PATH=%JAVA_HOME%\bin;%PATH%

echo Running System Health Check...
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar -wi 0 -i 1 -f 1 -rf json -rff health-check.json

echo.
powershell -Command "$result = Get-Content health-check.json | ConvertFrom-Json; Write-Host ('Health Check Score: ' + $result.primaryMetric.score + ' ops/s') -ForegroundColor Cyan"

call utility-scripts\cleanup-bench-temp.bat