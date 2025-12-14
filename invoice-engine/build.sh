#!/bin/bash
# Build Invoice Engine (Linux)

cd "$(dirname "$0")"

echo "======================================"
echo "Building Invoice Engine"
echo "======================================"
echo

mvn clean package -DskipTests

if [ $? -eq 0 ]; then
    echo
    echo "======================================"
    echo "Build completed successfully!"
    echo "======================================"
    echo
    echo "Executable JAR: invoice-engine/target/invoice-engine-0.0.1-SNAPSHOT-exec.jar"
    echo
else
    echo
    echo "======================================"
    echo "Build FAILED!"
    echo "======================================"
    exit 1
fi
