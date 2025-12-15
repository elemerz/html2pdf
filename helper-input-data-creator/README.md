# Helper Input Data Creator

This module simulates the random arrival of "classic" ZIP files (along with their presence markers) into the input folder monitored by the `invoice-parser` module.

## Purpose

During development and testing, this helper continuously generates realistic test data to simulate production-like conditions where invoice ZIP files arrive at random intervals.

## Features

- Generates classic format ZIP files with:
  - `*TPG_Meta.txt` - Metadata with invoice type counts and total amount
  - `*TPG_Debiteuren.txt` - Debtor/invoice records
  - `*TPG_Specificaties.txt` - Specification/line item details
- Creates 0-byte presence markers (`.txt` files) **after** each ZIP is fully written
- **Enhanced Logging**: Each log entry shows the batch count and file progress (e.g., `[Batch: 5] [3/5] Creating...`)
- **Property Auto-Reload**: Modify `application.properties` while running and see changes applied immediately without restart
- **Inter-File Delay Control**: Configure timing between files within a batch (e.g., simulate 142 files arriving at 200-500ms intervals)
- **Generation Modes**: `normal` (default), `fast` (machine-gun), `mixed` (random per batch)
- Randomizes:
  - Number of ZIP files per batch
  - Number of invoices per ZIP
  - Time delays between batches
  - Time delays between files within a batch (optional)
  - Invoice types
  - Patient names, addresses, amounts, dates, etc.

## Configuration

All behavior is controlled via `application.properties`:

### Output Location
```properties
data-generator.output-folder=C:/_invoice-data
```
Should match `zip.input-folder` from invoice-parser.

### Count Randomness
```properties
data-generator.batch.min-count=1
data-generator.batch.max-count=5
data-generator.invoice.min-count=1
data-generator.invoice.max-count=10
```

### Time Distribution
```properties
data-generator.delayMinMs=2000
data-generator.delayMaxMs=10000
data-generator.interFileDelayMinMs=0
data-generator.interFileDelayMaxMs=0
data-generator.markerDelayMs=500
```

**Batch Delay** (`delayMinMs/MaxMs`): Time between batches  
**Inter-File Delay** (`interFileDelayMinMs/MaxMs`): Time between files WITHIN a batch (0 = no delay)  
**Marker Delay** (`markerDelayMs`): Fixed delay to ensure ZIP is complete before marker (skipped in `fast` mode)

### Operating Mode
```properties
data-generator.continuous-mode=true
```
- `true`: Runs indefinitely (press Ctrl+C to stop)
- `false`: Generates one batch and exits

### Generation Mode
```properties
data-generator.generationMode=normal  # normal | fast | mixed
```
- `normal`: current behavior (respects inter-file and marker delays)
- `fast`: no inter-file delay and skips marker delay for maximum throughput
- `mixed`: randomly selects `normal` or `fast` per batch

### Invoice Types
```properties
data-generator.invoice-types=1,2,3,4,5,6,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,28,29,30,32,33,34,36,40,41,42,44,45,50,51,64,65,66,68
```

## Usage

### Build
```bash
mvn clean package
```

### Run
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar
```

### Run with custom properties
```bash
java -jar target/helper-input-data-creator-0.0.1-SNAPSHOT.jar --data-generator.batch.max-count=10
```

## Implementation Notes

Based on the PowerShell scripts in `invoice-parser/utility-scripts`:
- `Generate-SampleData.ps1` - Data generation logic
- `Create-PresenceMarkers.ps1` - Presence marker creation pattern

The module ensures presence markers are always created **after** their corresponding ZIP files to prevent premature processing by the invoice-parser's file watcher.

## New Features

### 1. Enhanced Logging
All log messages now include batch context for better traceability:
```
[Batch: 5] === Generating 5 file(s) ===
[Batch: 5] [1/5] Creating: ACC_CMIB_NOLA_20251214_12345.zip (type=21, count=1)
[Batch: 5] [1/5] Created marker: ACC_CMIB_NOLA_20251214_12345.txt
[Batch: 5] === Complete: 5 file(s) generated ===
```

### 2. Property Auto-Reload
The module watches `application.properties` for changes and reloads automatically:
- Modify any property in the file while the application is running
- Changes are detected and applied within seconds
- No restart required
- Confirmation message shows the new configuration:
  ```
  >>> Properties reloaded successfully <<<
  Current config - Batch: 1-3, Invoices: 1-10, Delay: 2000-10000ms, Output: C:/_invoice-data
  ```

**Example**: Change `data-generator.batchMaxCount` from 5 to 3, save the file, and the next batch will use the new value!
