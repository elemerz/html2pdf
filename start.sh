#!/bin/bash
echo "Starting PDF Creator..."
(cd pdf-creator && ./start.sh) &
PID_PDF=$!

sleep 5

echo "Starting Invoice Parser..."
(cd invoice-parser && ./start.sh) &
PID_PARSER=$!

echo "Services started with PIDs: PDF=$PID_PDF, Parser=$PID_PARSER"