# Throughput and Stability Fixes for High-Volume Processing

## Issues Found and Fixed

### 1. **CRITICAL: Unbounded Virtual Thread Executor (FolderWatcherService)**
**Problem:** Line 45 used `Executors.newVirtualThreadPerTaskExecutor()` which creates unlimited threads. With 1000 files, this created 1000+ concurrent threads flooding the system.

**Fix:** 
- Replaced with bounded `FixedThreadPool` (64 threads by default)
- Added semaphore-based backpressure (30-second timeout)
- Files that can't acquire a permit are moved to failed directory instead of silently dropped

### 2. **CRITICAL: Files Silently Dropped on Timeout**
**Problem:** When `tryAcquire(5, TimeUnit.SECONDS)` returned false, files were logged but never processed or moved to failed directory. This caused the "713 out of 1000" pattern.

**Fix:**
- Increased timeout to 30 seconds
- Files that timeout are now moved to failed directory for retry
- Interrupted files also moved to failed directory

### 3. **Thread Pool Resource Leak (InvoiceProcessorClient)**
**Problem:** ExecutorService created for HttpClient was never shut down, causing thread pool exhaustion over time.

**Fix:**
- Added `@PreDestroy` hook to properly shutdown executor
- Added graceful shutdown with 10-second timeout
- Stored executor reference for cleanup

### 4. **No Retry Logic on Transient Failures**
**Problem:** Single network glitch or temporary server overload would permanently fail a conversion.

**Fix:**
- Added 3-attempt retry with exponential backoff (1s, 2s, 3s)
- Only IOException triggers retry (not HTTP 4xx errors)
- Better error messages showing attempt number

### 5. **Request Timeout Too Short**
**Problem:** 30-second timeout wasn't enough when server was under heavy load processing 1000 files.

**Fix:**
- Increased to 2 minutes (PT2M)
- This gives conversions time to complete even when queued

### 6. **Server Connection Pool Mismatch**
**Problem:** 
- `server.tomcat.max-connections=10000`
- `server.tomcat.threads.max=200`
- Large mismatch caused connection queue buildup

**Fix:**
- Reduced max-connections to 1000
- Reduced accept-count to 200
- Now aligned with thread pool capacity

### 7. **Unbounded HTTP Client Connections**
**Problem:** Default HttpClient had no connection limits, creating unlimited concurrent connections to server.

**Fix:**
- Added `max-concurrent-requests=64` configuration
- HTTP client now uses bounded executor pool
- Upgraded to HTTP/2 for better connection multiplexing

### 8. **Missing Graceful Shutdown**
**Problem:** ExecutorService in FolderWatcherService wasn't properly shut down on application stop.

**Fix:**
- Added `@PreDestroy` hook with 30-second graceful shutdown
- Forces shutdown if not completed
- Interrupts watcher thread

## Configuration Changes

### invoice-processor/application.properties
```properties
folder.watcher.max-concurrent=64                    # NEW: Limits concurrent conversions
invoice.processor.request-timeout=PT2M              # CHANGED: 30s → 2m
invoice.processor.max-concurrent-requests=64        # NEW: Limits HTTP connections
```

### xhtml2pdf/application.properties
```properties
server.tomcat.max-connections=1000                  # CHANGED: 10000 → 1000
server.tomcat.accept-count=200                      # CHANGED: 2000 → 200
```

## How This Fixes the 1000-File Problem

**Before:**
1. 1000 files detected → 1000 virtual threads created instantly
2. All 1000 threads try to acquire HTTP connection
3. 64 HTTP connections created, rest wait
4. Server gets overwhelmed with 64 concurrent requests
5. Some requests timeout after 30s
6. Timed-out files silently dropped → "713 converted, 287 failed"

**After:**
1. 1000 files detected → Queued for 64 worker threads
2. Only 64 threads active, each waits for semaphore permit (30s timeout)
3. HTTP client limits to 64 concurrent connections (HTTP/2 multiplexing)
4. Server processes 64 conversions at a time
5. If request fails, retry up to 3 times with backoff
6. If still fails or timeout, file moved to failed directory for manual review
7. All 1000 files eventually processed or moved to failed

## Testing Recommendations

1. **Test with 1000 files** - Should now process all without silent drops
2. **Monitor logs** for:
   - "Active conversions: X/64" - should never exceed 64
   - "Unable to acquire conversion permit" - if frequent, increase timeout or reduce file volume
   - "Conversion attempt X failed, retrying" - indicates transient issues
3. **Check failed directory** - Files here need investigation, not silent failures
4. **JVM monitoring** - Thread count should stay stable around 64-128, not spike to 1000+

## Performance Tuning

If you need higher throughput, adjust these together:
- `folder.watcher.max-concurrent=128`
- `invoice.processor.max-concurrent-requests=128`
- `converter.max-concurrent=128` (in xhtml2pdf)
- `server.tomcat.threads.max=256`

Keep ratios balanced: worker threads ≈ HTTP connections ≈ server conversions ≈ half of server threads
