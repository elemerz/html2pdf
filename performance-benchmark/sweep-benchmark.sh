#!/usr/bin/env bash
set -euo pipefail
JFR_DIR="artifacts/jfr"
RESULT_DIR="artifacts"
mkdir -p "$JFR_DIR" "$RESULT_DIR"
TS=$(date +%Y%m%d_%H%M%S)
JFR_FILE="$JFR_DIR/invoice-bench-$TS.jfr"
JSON_OUT="$RESULT_DIR/jmh-sweep-$TS.json"

echo "Running JMH sweep with JFR -> $JFR_FILE"
java --enable-native-access=ALL-UNNAMED -XX:StartFlightRecording=filename=$JFR_FILE,settings=profile,dumponexit=true \
  -jar target/benchmarks.jar InvoiceSystemBenchmark \
  -p modelType=classic \
  -p zipConcurrentWorkers=4,8,16 \
  -p pdfMaxConcurrentConversions=4,8,16 \
  -rf json -rff "$JSON_OUT" "$@"

echo "Results JSON: $JSON_OUT"
echo "JFR: $JFR_FILE"
