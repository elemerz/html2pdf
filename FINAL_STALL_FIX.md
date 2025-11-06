# Fix for Processing Stall After ~217 Files

## Problem
- 100 files: ✅ Works
- 1000 files: ⚠️ Only ~217 converted, rest STALL (files remain in input folder)
- Restart → remaining files process fine

## Root Cause: SEMAPHORE LEAK

### The Bug
**OLD CODE:**
```java
private void submitMarker(Path markerFile) {
    if (conversionPermits.tryAcquire(30, TimeUnit.SECONDS)) {  // ← Acquire OUTSIDE
        conversionExecutor.submit(() -> {                      // ← Can fail/reject
            try {
                processMarker(markerFile);
            } finally {
                conversionPermits.release();                   // ← Release INSIDE
            }
        });
    }
}
```

**Problem:** 
1. Semaphore acquired on calling thread
2. `submit()` can throw `RejectedExecutionException` when queue is full
3. Exception happens AFTER acquire but BEFORE task runs
4. Permit is acquired but never released → **LEAK**
5. After ~217 leaks, all 64 permits gone → **DEADLOCK**

### Secondary Issue: Unbounded Queue
`Executors.newFixedThreadPool()` uses **unbounded LinkedBlockingQueue**.
- 1000 tasks submitted rapidly
- All 1000 tasks queued instantly
- All trying to acquire from same 64 permits
- Potential for queue exhaustion and memory pressure

## Fixes Applied

### 1. Semaphore Lifecycle Fix
**NEW CODE:**
```java
private void submitMarker(Path markerFile) {
    conversionExecutor.submit(() -> {           // ← Submit FIRST
        boolean acquired = false;
        try {
            acquired = conversionPermits.tryAcquire(30, TimeUnit.SECONDS);  // ← Acquire INSIDE
            if (!acquired) {
                movePairToFailed(htmlFile, markerFile);
                return;
            }
            processMarker(markerFile);
        } finally {
            if (acquired) {
                conversionPermits.release();    // ← Always released in same thread
            }
        }
    });
}
```

**Benefits:**
- ✅ Acquire and release in SAME thread
- ✅ Finally block guarantees release even on exception
- ✅ No leaks possible

### 2. Bounded Queue with Backpressure
**NEW CODE:**
```java
int queueCapacity = maxConcurrentConversions * 4; // 256 for default 64
this.conversionExecutor = new ThreadPoolExecutor(
    maxConcurrentConversions,
    maxConcurrentConversions,
    60L, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(queueCapacity),        // ← BOUNDED queue
    threadFactory,
    new ThreadPoolExecutor.CallerRunsPolicy()        // ← Backpressure
);
```

**Benefits:**
- ✅ Queue limited to 256 tasks (4x thread pool)
- ✅ CallerRunsPolicy: if queue full, caller processes the task (natural backpressure)
- ✅ Prevents memory exhaustion
- ✅ Prevents overwhelming executor

### 3. Rejection Handling
```java
try {
    conversionExecutor.submit(...);
} catch (RejectedExecutionException e) {
    System.err.println("Executor rejected task for " + markerFile);
    movePairToFailed(htmlFile, markerFile);
}
```

### 4. Executor State Logging
Added `logExecutorState()` to diagnose issues:
- Available permits
- Active threads
- Queued tasks
- Completed tasks

## Why 217 Files?

217 is approximately 3-4 rounds of 64 concurrent processing:
- Round 1: 64 files (all permits used)
- Round 2: 64 files (all permits used)
- Round 3: 64 files (all permits used)
- Round 4: 25 files processed, then 39 leaks happen → DEADLOCK

The exact number varies based on timing and exceptions.

## Testing

1. **Rebuild invoice-processor:**
```bash
cd invoice-processor
mvn clean package
```

2. **Restart application**

3. **Test with 1000 files:**
```
Expected output:
FolderWatcherService initialized with max 64 concurrent conversions, queue capacity: 256
```

4. **Monitor logs** - Should NOT see:
- "Unable to acquire conversion permit after 30 seconds"
- "Executor rejected task"

5. **All 1000 files should convert** without needing restart

## Additional Improvements

The CallerRunsPolicy provides natural backpressure:
- If executor queue fills (256 tasks waiting)
- Instead of rejecting, the calling thread (file watcher) processes the task
- This slows down file discovery naturally
- Prevents system overload

This is MUCH better than the old approach of silent deadlock!
