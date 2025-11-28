#!/bin/bash
if [ -n "$JAVA_HOME25" ]; then
    export JAVA_HOME="$JAVA_HOME25"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "Running System Health Check..."
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar -wi 0 -i 1 -f 1 -rf json -rff health-check.json

echo ""
python3 -c "import json; print(f'Health Check Score: {json.load(open('health-check.json'))[0]['primaryMetric']['score']} ops/s')"

./utility-scripts/cleanup-bench-temp.sh