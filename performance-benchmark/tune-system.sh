#!/bin/bash
if [ -n "$JAVA_HOME25" ]; then
    export JAVA_HOME="$JAVA_HOME25"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "Starting Automatic System Tuning..."
echo "Please ensure pdf-creator is running externally!"

# Run JMH
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar -p zipConcurrentWorkers=8,16,32 -p pdfMaxConcurrentConversions=8,16,32 -wi 1 -i 3 -f 1 -rf json -rff tuning-results.json

echo ""
echo "Analyzing results..."
# Use python to parse JSON
python3 -c "import json, sys; data = json.load(open('tuning-results.json')); best = max(data, key=lambda x: x['primaryMetric']['score']); print(f'Best Configuration:\n  Throughput: {best['primaryMetric']['score']} ops/s\n  Zip Workers: {best['params']['zipConcurrentWorkers']}\n  PDF Conversions: {best['params']['pdfMaxConcurrentConversions']}')"

echo ""
./utility-scripts/cleanup-bench-temp.sh