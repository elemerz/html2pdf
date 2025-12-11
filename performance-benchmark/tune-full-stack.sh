#!/bin/bash

PDF_LEVELS=(8 16 32)
BEST_SCORE=0
BEST_CONFIG=""

stop_pdf_creator() {
    echo "Stopping PDF Creator..."
    # Find PID listening on 6969
    PID=$(lsof -t -i:6969)
    if [ -n "$PID" ]; then
        kill -9 $PID
        sleep 2
    fi
}

wait_for_pdf_creator() {
    RETRIES=30
    URL="http://localhost:6969"
    while [ $RETRIES -gt 0 ]; do
        if curl -s --head "$URL" >/dev/null; then
            return 0
        fi
        sleep 1
        RETRIES=$((RETRIES-1))
    done
    return 1
}

echo "Starting Full Stack Tuning..."

for LEVEL in "${PDF_LEVELS[@]}"; do
    echo ""
    echo "========================================================"
    echo "Testing PDF Creator Concurrency: $LEVEL"
    echo "========================================================"

    stop_pdf_creator
    
    # Start PDF Creator
    START_SCRIPT="../pdf-creator/start.sh"
    ARG="--converter.max-concurrent=$LEVEL"
    echo "Starting PDF Creator: $START_SCRIPT $ARG"
    
    # Start in background
    (cd ../pdf-creator && ./start.sh "$ARG") > /dev/null 2>&1 &
    
    echo "Waiting for PDF Creator to initialize..."
    if ! wait_for_pdf_creator; then
        echo "PDF Creator failed to start!"
        continue
    fi
    echo "PDF Creator is UP."

    # Run client tuning
    echo "Running benchmark sweep..."
    ./tune-system.sh
    
    # Analyze results
    if [ -f "tuning-results.json" ]; then
        # Extract best score using python
        BATCH_BEST=$(python3 -c "import json; data = json.load(open('tuning-results.json')); best = max(data, key=lambda x: x['primaryMetric']['score']); print(f\"{best['primaryMetric']['score']}|{best['params']['zipConcurrentWorkers']}|{best['params']['pdfMaxConcurrentConversions']}\")")
        
        SCORE=$(echo $BATCH_BEST | cut -d'|' -f1)
        ZIP=$(echo $BATCH_BEST | cut -d'|' -f2)
        PDF=$(echo $BATCH_BEST | cut -d'|' -f3)
        
        echo "Batch Best: $SCORE ops/s (Zip=$ZIP, ClientPDF=$PDF)"
        
        # Compare floating point numbers
        if (( $(echo "$SCORE > $BEST_SCORE" | bc -l) )); then
            BEST_SCORE=$SCORE
            BEST_CONFIG="Throughput: $SCORE ops/s\n  PDF Server Threads: $LEVEL\n  Zip Client Workers: $ZIP\n  PDF Client Limit: $PDF\nRecommended settings:\n- invoice-parser:pdf.max-concurrent-conversions=$PDF\n- pdf-creator:converter.max-concurrent=$LEVEL"
        fi
    else
        echo "No tuning results found."
    fi
done

stop_pdf_creator

echo ""
echo "********************************************************"
echo "FULL STACK TUNING COMPLETE"
echo "********************************************************"
echo "Global Best Configuration:"
echo -e "$BEST_CONFIG"
echo "********************************************************"
