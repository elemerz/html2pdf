package nl.infomedics.xhtml2pdf.config;

import java.io.IOException;

import org.springframework.stereotype.Component;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Filter to log all incoming requests and responses for debugging 413 errors.
 */
@Slf4j
@Component
public class RequestLoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        String method = null;
        String uri = null;
        if (request instanceof HttpServletRequest httpRequest) {
            method = httpRequest.getMethod();
            uri = httpRequest.getRequestURI();
            String contentLength = httpRequest.getHeader("Content-Length");

            log.debug("Incoming request: method={}, uri={}, contentLength={} bytes, contentType={}",
                    method, uri, contentLength, httpRequest.getContentType());
        }

        try {
            chain.doFilter(request, response);
        } finally {
            if (response instanceof HttpServletResponse httpResponse) {
                int status = httpResponse.getStatus();
                if (status == 413) {
                    String target = method != null && uri != null ? method + " " + uri : "request";
                    log.warn("HTTP 413 Payload Too Large returned for {}; check Tomcat connector customization.", target);
                }
            }
        }
    }
}
