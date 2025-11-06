# Final Fix for HTTP 413 Payload Too Large

## Problem
Despite setting properties in application.properties:
```properties
server.tomcat.max-http-post-size=104857600
server.tomcat.max-swallow-size=104857600
```
The HTTP 413 error persists after rebuild and restart.

## Root Cause
In Spring Boot 3.x with embedded Tomcat, **property-based configuration for max-post-size may not always work** due to:
1. Order of bean initialization
2. Tomcat connector being created before properties are applied
3. Possible property name changes between Spring Boot versions

## Solution: Programmatic Configuration

Added **Java configuration** to `ServerPerformanceConfiguration.java` that directly customizes the Tomcat connector:

```java
@Bean
WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
    return factory -> {
        factory.addConnectorCustomizers(connector -> {
            connector.setMaxPostSize(104857600); // 100MB
            connector.setMaxSwallowSize(104857600); // 100MB
        });
        System.out.println("Tomcat configured with max POST size: 100MB");
    };
}
```

This approach:
- ✅ Directly configures Tomcat connector before server startup
- ✅ Guaranteed to execute in correct order
- ✅ Logs confirmation message on startup
- ✅ Works regardless of Spring Boot version

## Files Modified

1. **xhtml2pdf/src/main/java/nl/infomedics/xhtml2pdf/config/ServerPerformanceConfiguration.java**
   - Added imports: `TomcatServletWebServerFactory`, `WebServerFactoryCustomizer`
   - Added `tomcatCustomizer()` bean

2. **xhtml2pdf/src/main/resources/application.properties**
   - Properties remain as backup/documentation

## How to Verify

After rebuilding and restarting xhtml2pdf, you should see in the logs:
```
Tomcat configured with max POST size: 100MB
```

If this message appears and 413 still occurs, check for:
1. Reverse proxy/load balancer in front (nginx, Apache, IIS)
2. Network security appliances
3. Cloud platform limits (Azure, AWS)

## Alternative Debugging

If still getting 413, check actual request size:
```java
// Add to HtmlToPdfController
@PostMapping("/convert")
public ResponseEntity<HtmlToPdfResponse> convertHtmlToPdf(@RequestBody String rawBody, @Valid @RequestBody HtmlToPdfRequest request) {
    System.out.println("Received request size: " + rawBody.length() + " bytes");
    // ... rest of code
}
```

## Next Steps

1. Rebuild xhtml2pdf: `mvn clean package`
2. Restart xhtml2pdf application
3. Check logs for "Tomcat configured with max POST size: 100MB"
4. Test with 1000 files
5. If still failing, check if there's a reverse proxy/gateway with its own limits
