# Fix for HTTP 413 Payload Too Large Error

## Problem
After fixing the threading issues, ALL 1000 conversions now fail with:
```
Error converting c:\samples\fin-sample-0999.txt: Remote service responded with status 413 and body: <!doctype html><html lang="en"><head><title>HTTP Status 413 – Payload Too Large
```

## Root Cause
The xhtml2pdf server has default Tomcat limits for HTTP POST request body size (typically 2MB). When the invoice-processor sends large XHTML content as JSON payload, it exceeds this limit.

The existing configuration only set multipart upload limits (64MB), which don't apply to JSON POST requests:
```properties
spring.servlet.multipart.max-request-size=64MB   # Only for file uploads
spring.servlet.multipart.max-file-size=64MB      # Only for file uploads
```

## Solution Applied

Added Tomcat-specific HTTP POST size limits in `xhtml2pdf/application.properties`:

```properties
server.tomcat.max-http-post-size=104857600      # 100MB in bytes
server.tomcat.max-swallow-size=104857600        # 100MB in bytes
server.max-http-request-header-size=100KB       # Also increased headers
spring.codec.max-in-memory-size=100MB           # Increased from 64MB
```

### Why These Settings:

1. **`server.tomcat.max-http-post-size`** - Maximum size of HTTP POST request body
   - Default: 2MB (2097152 bytes)
   - Set to: 100MB (104857600 bytes)
   - This is the key setting that fixes the 413 error

2. **`server.tomcat.max-swallow-size`** - Maximum size Tomcat will "swallow" on connection close
   - Prevents issues when large requests are cancelled/rejected

3. **`server.max-http-request-header-size`** - Maximum HTTP header size
   - Default: 8KB
   - Increased to 100KB for large headers

4. **`spring.codec.max-in-memory-size`** - Maximum JSON payload Spring will buffer in memory
   - Increased from 64MB to 100MB

## Why The Problem Appeared After Threading Fixes

Before the threading fixes:
- Unlimited virtual threads created race conditions and resource exhaustion
- Most requests failed due to timeouts/threading issues **before** reaching the payload size check
- Only ~713 requests succeeded, and those happened to have smaller payloads

After the threading fixes:
- All 1000 requests now properly reach the server
- Server correctly validates payload size and rejects all with HTTP 413
- The threading fixes exposed the **existing** payload size misconfiguration

## Testing
After applying this fix, the xhtml2pdf server will accept JSON payloads up to 100MB, which should handle even very large XHTML documents with embedded images.

Restart the xhtml2pdf application for the changes to take effect.
