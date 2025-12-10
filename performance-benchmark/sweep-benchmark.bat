@echo off
setlocal
set JFR_DIR=artifacts\jfr
set RESULT_DIR=artifacts
if not exist %JFR_DIR% mkdir %JFR_DIR%
if not exist %RESULT_DIR% mkdir %RESULT_DIR%

set TS=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
set TS=%TS: =0%
set JFR_FILE=%JFR_DIR%\invoice-bench-%TS%.jfr
set JSON_OUT=%RESULT_DIR%\jmh-sweep-%TS%.json

echo Running JMH sweep with JFR -> %JFR_FILE%
java --enable-native-access=ALL-UNNAMED -XX:StartFlightRecording=filename=%JFR_FILE%,settings=profile,dumponexit=true ^
    -jar target\benchmarks.jar InvoiceSystemBenchmark ^
    -p modelType=classic ^
    -p zipConcurrentWorkers=4,8,16 ^
    -p pdfMaxConcurrentConversions=4,8,16 ^
    -rf json -rff %JSON_OUT% %*

echo Results JSON: %JSON_OUT%
echo JFR: %JFR_FILE%
endlocal
