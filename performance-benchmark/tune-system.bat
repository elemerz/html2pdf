@echo off
SETLOCAL
IF DEFINED JAVA_HOME25 (
    SET JAVA_HOME=%JAVA_HOME25%
)
SET PATH=%JAVA_HOME%\bin;%PATH%

echo Starting Automatic System Tuning...
echo This will run benchmarks with various parameter combinations.
echo Please ensure pdf-creator is running externally!

REM Run JMH with parameter sweeps
REM We use -wi 1 -i 3 -f 1 to keep it relatively short for this demo, but in real life it should be longer.
REM We vary workers and pdf conversions.
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar -p zipConcurrentWorkers=8,16,32 -p pdfMaxConcurrentConversions=8,16,32 -wi 1 -i 3 -f 1 -rf json -rff tuning-results.json

echo.
echo Analyzing results...
powershell -Command "$results = Get-Content tuning-results.json | ConvertFrom-Json; $best = $results | Sort-Object -Property @{Expression={$_.primaryMetric.score}} -Descending | Select-Object -First 1; Write-Host 'Best Configuration:' -ForegroundColor Green; Write-Host ('  Throughput: ' + $best.primaryMetric.score + ' ops/s'); Write-Host ('  Zip Workers: ' + $best.params.zipConcurrentWorkers); Write-Host ('  PDF Conversions: ' + $best.params.pdfMaxConcurrentConversions)"

echo.
call utility-scripts\cleanup-bench-temp.bat