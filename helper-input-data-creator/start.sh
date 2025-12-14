#!/bin/bash
# Start the helper-input-data-creator module
# This will continuously generate random ZIP files with presence markers

cd "$(dirname "$0")"

if [ ! -f "target/helper-input-data-creator-0.0.1-SNAPSHOT.jar" ]; then
    echo "JAR file not found. Building..."
    mvn clean package -DskipTests
    if [ $? -ne 0 ]; then
        echo "Build failed!"
        exit 1
    fi
fi

echo "Starting Input Data Creator Helper..."
echo "Press Ctrl+C to stop"
echo

java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar
