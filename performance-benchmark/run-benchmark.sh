#!/bin/bash
if [ -n "$JAVA_HOME25" ]; then
    export JAVA_HOME="$JAVA_HOME25"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "Running JMH Benchmarks..."
java --sun-misc-unsafe-memory-access=allow --enable-native-access=ALL-UNNAMED -jar target/benchmarks.jar -rf json