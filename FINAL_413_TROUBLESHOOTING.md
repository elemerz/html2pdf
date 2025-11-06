# HTTP 413 - Final Troubleshooting Steps

## Changes Applied

### 1. ServerPerformanceConfiguration.java
Added Tomcat connector customization with **UNLIMITED** POST size:
```java
@Bean
WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
    return factory -> {
        factory.addConnectorCustomizers(connector -> {
            int maxSize = -1; // -1 = unlimited
            connector.setMaxPostSize(maxSize);
            System.out.println("============================================");
            System.out.println("TOMCAT CONNECTOR CUSTOMIZATION APPLIED:");
            System.out.println("Max POST Size set to: " + (maxSize == -1 ? "UNLIMITED" : maxSize + " bytes"));
            System.out.println("Connector: " + connector);
            System.out.println("============================================");
        });
    };
}
```

### 2. RequestLoggingFilter.java (NEW)
Added servlet filter to log ALL incoming requests and catch 413 errors:
- Logs request method, URI, Content-Length
- Logs when 413 status is returned

### 3. HtmlToPdfController.java
Added logging to see request sizes that DO reach the controller.

## CRITICAL: How to Test

### Step 1: Rebuild
```bash
cd xhtml2pdf
mvn clean package
```

### Step 2: Start Application
Look for these EXACT lines in the startup logs:
```
============================================
TOMCAT CONNECTOR CUSTOMIZATION APPLIED:
Max POST Size set to: UNLIMITED
Connector: org.apache.catalina.connector.Connector[HTTP/1.1-8080]
============================================
```

**IF YOU DON'T SEE THIS, THE CONFIGURATION IS NOT BEING APPLIED!**

### Step 3: Test One File
Copy just ONE sample file to c:\samples and watch the xhtml2pdf logs:

**If you see:**
```
=== INCOMING REQUEST ===
Method: POST
URI: /api/v1/pdf/convert
Content-Length: 23456 bytes
Content-Type: application/json
========================
>>> Received conversion request - HTML size: 23456 bytes (22 KB)
```
**→ The request reached the application (GOOD)**

**If you see:**
```
=== INCOMING REQUEST ===
Method: POST
URI: /api/v1/pdf/convert
Content-Length: 23456 bytes
!!! HTTP 413 PAYLOAD TOO LARGE RETURNED !!!
```
**→ The 413 is being returned by Tomcat BEFORE reaching the controller (BAD)**

## Possible Root Causes

### 1. HTTP/2 Protocol Issue
You have `server.http2.enabled=true`. Try disabling it:
```properties
server.http2.enabled=false
```
HTTP/2 has different handling for large payloads.

### 2. Java 25 Issue
Amazon Corretto JDK 25 is very new. Possible compatibility issue with Spring Boot 3.x.
Try with JDK 21 LTS (Amazon Corretto 21).

### 3. Windows Defender / Antivirus
Some antivirus software inspects HTTP traffic and enforces their own limits.
Temporarily disable Windows Defender and test.

### 4. Loopback Adapter Issue
Windows loopback (localhost/127.0.0.1) sometimes has issues.
Try using actual machine IP: `http://192.168.x.x:8080` instead of `http://localhost:8080`

### 5. Application Not Running Latest Build
Ensure you're running the NEW JAR:
```bash
# Kill any running xhtml2pdf processes
# Start fresh from target/ directory
java -jar xhtml2pdf/target/xhtml2pdf-0.0.1-SNAPSHOT.jar
```

### 6. Reverse Proxy / Gateway
Check if there's ANY software between invoice-processor and xhtml2pdf:
- IIS
- nginx
- Apache
- Corporate proxy
- VPN software

## Test Commands

### Check What's Listening on Port 8080
```powershell
netstat -ano | findstr :8080
```

### Test Direct with curl
```powershell
# Create small test payload
$json = @{html="<html><body>test</body></html>";includeSanitisedXhtml=$true} | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:8080/api/v1/pdf/convert -Method POST -Body $json -ContentType "application/json" -Headers @{"Accept"="application/json"}
```

### Check Actual Request Size
Add this to invoice-processor to see what's being sent:
```java
String requestBody = objectMapper.writeValueAsString(payload);
System.out.println("Sending request size: " + requestBody.length() + " bytes");
```

## Next Steps

1. **Rebuild xhtml2pdf completely**: `mvn clean package`
2. **Kill all Java processes**
3. **Start xhtml2pdf**: Look for "TOMCAT CONNECTOR CUSTOMIZATION APPLIED" in logs
4. **Test with ONE file**: Watch both applications' logs
5. **Report back**: 
   - Did you see "TOMCAT CONNECTOR CUSTOMIZATION APPLIED"?
   - What Content-Length is shown in "INCOMING REQUEST"?
   - Did request reach ">>> Received conversion request"?
   - Or did it stop at "!!! HTTP 413 !!!"?
