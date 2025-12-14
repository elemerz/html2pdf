#!/bin/bash
# Invoice Engine Startup Script (Linux)

echo "======================================"
echo "Invoice Engine - High Performance Mode"
echo "======================================"

cd "$(dirname "$0")"

# JVM Performance Options
JVM_OPTS="-XX:+UseG1GC \
-Xms4g -Xmx8g \
-XX:MaxGCPauseMillis=200 \
-XX:G1ReservePercent=15 \
-XX:+UnlockExperimentalVMOptions \
-XX:+UseStringDeduplication \
-XX:+AlwaysPreTouch"

# Remote Debug Configuration (port 5501)
DEBUG_OPTS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5501"

# Application Configuration
APP_OPTS="-Dserver.port=5959 \
-Dspring.profiles.active=dev \
-Dlogging.config=./config/logback.xml"

# Combined Options
JAVA_OPTS="$JVM_OPTS $DEBUG_OPTS $APP_OPTS"

echo "Starting Invoice Engine..."
echo "Web Server Port: 5959"
echo "Remote Debug Port: 5501"
echo "Spring Profile: dev"
echo "Logging Config: ./config/logback.xml"
echo
echo "Java Options: $JAVA_OPTS"
echo

java $JAVA_OPTS -jar target/invoice-engine-0.0.1-SNAPSHOT.jar
