# Quick Start Examples

## 1. Default Continuous Mode
Runs indefinitely, generating batches at random intervals:
```bash
# Windows
start.bat

# Linux/Mac
./start.sh
```

## 2. Single Batch Mode
Generate one batch and exit:
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar --data-generator.continuous-mode=false
```

## 3. Custom Batch Size
Generate larger batches (10-20 files per batch):
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.batch.min-count=10 ^
  --data-generator.batch.max-count=20
```

## 4. Faster Generation
Reduce delays for stress testing:
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.delay.min-ms=500 ^
  --data-generator.delay.max-ms=2000
```

## 5. Custom Output Folder
Send files to a different location:
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.output-folder=D:\test\input
```

## 6. Large Invoices
Generate ZIPs with many invoices:
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.invoice.min-count=50 ^
  --data-generator.invoice.max-count=100
```

## 7. Slow Steady Stream
Simulate slow arrival rate:
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.batch.min-count=1 ^
  --data-generator.batch.max-count=2 ^
  --data-generator.delay.min-ms=30000 ^
  --data-generator.delay.max-ms=60000
```

## 8. Production-like Burst
Simulate production bursts:
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar ^
  --data-generator.batch.min-count=5 ^
  --data-generator.batch.max-count=15 ^
  --data-generator.invoice.min-count=5 ^
  --data-generator.invoice.max-count=25 ^
  --data-generator.delay.min-ms=5000 ^
  --data-generator.delay.max-ms=20000
```

## Important Notes

1. **Presence Marker Timing**: The helper always creates the `.txt` presence marker 500ms (configurable via `data-generator.marker.delay-ms`) after the `.zip` file to ensure the ZIP is fully written before processing starts.

2. **Output Folder**: Make sure the `data-generator.output-folder` matches the `zip.input-folder` in `invoice-parser`'s `application.properties`.

3. **Stopping**: Press `Ctrl+C` to gracefully stop the generator in continuous mode.

4. **File Naming**: Generated files follow the pattern:
   - ZIP: `{Company}_{System}_{Date}_{Ticks}.zip`
   - Marker: `{Company}_{System}_{Date}_{Ticks}.txt`
   
   Example: `InfFactoring_TIM_20251214_17033849562340000.zip`
