# File Processing Stalls After ~217 Files

## Symptoms
- 1 file: ✅ Works
- 100 files: ✅ Works  
- 1000 files: ⚠️ Only 217 converted, then STOPS
- Files remain in input folder (not moved to failed)
- Restart invoice-processor → remaining files process fine

## Root Cause Analysis

This is a **CLASSIC DEADLOCK or RESOURCE EXHAUSTION** pattern:

### Theory 1: Semaphore Deadlock (MOST LIKELY)
The semaphore in `submitMarker()` uses `tryAcquire(30, TimeUnit.SECONDS)`.

If a thread:
1. Acquires the semaphore
2. Submits task to executor
3. Task throws exception BEFORE entering the finally block
4. Semaphore is NEVER released → LEAK

After 217 leaks, all 64 permits are gone = DEADLOCK

### Theory 2: Executor Queue Full
Fixed thread pool with bounded semaphore but unbounded queue could still fill up.

### Theory 3: File Watch Event Overflow
WatchService may stop delivering events after queue fills.

Let me check the code...
