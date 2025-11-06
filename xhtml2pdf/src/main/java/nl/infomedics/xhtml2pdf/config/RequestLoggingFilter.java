package nl.infomedics.xhtml2pdf.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Filter to log all incoming requests and responses for debugging 413 errors.
 */
@Component
public class RequestLoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        
        if (request instanceof HttpServletRequest httpRequest) {
            String method = httpRequest.getMethod();
            String uri = httpRequest.getRequestURI();
            String contentLength = httpRequest.getHeader("Content-Length");
            
            System.out.println("=== INCOMING REQUEST ===");
            System.out.println("Method: " + method);
            System.out.println("URI: " + uri);
            System.out.println("Content-Length: " + contentLength + " bytes");
            System.out.println("Content-Type: " + httpRequest.getContentType());
            System.out.println("========================");
        }
        
        try {
            chain.doFilter(request, response);
        } finally {
            if (response instanceof HttpServletResponse httpResponse) {
                int status = httpResponse.getStatus();
                if (status == 413) {
                    System.err.println("!!! HTTP 413 PAYLOAD TOO LARGE RETURNED !!!");
                    System.err.println("Check if Tomcat connector customization was applied at startup!");
                }
            }
        }
    }
}
