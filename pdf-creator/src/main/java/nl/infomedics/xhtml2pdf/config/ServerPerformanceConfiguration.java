package nl.infomedics.xhtml2pdf.config;

import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.coyote.ProtocolHandler;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.tomcat.TomcatProtocolHandlerCustomizer;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.web.servlet.config.annotation.AsyncSupportConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import lombok.extern.slf4j.Slf4j;

/**
 * Configures embedded Tomcat and MVC async handling to leverage virtual threads,
 * and provides a bounded platform-thread executor for heavy PDF conversions.
 */
@Slf4j
@Configuration
public class ServerPerformanceConfiguration implements WebMvcConfigurer {

    private static final Duration DEFAULT_ASYNC_TIMEOUT = Duration.ofMinutes(2);
    private final AsyncTaskExecutor virtualTaskExecutor;

    public ServerPerformanceConfiguration(
            @Qualifier("virtualTaskExecutor") @Lazy AsyncTaskExecutor virtualTaskExecutor) {
        this.virtualTaskExecutor = virtualTaskExecutor;
    }

    @Bean(destroyMethod = "shutdown")
    ExecutorService virtualThreadExecutor() {
        return Executors.newThreadPerTaskExecutor(
                Thread.ofVirtual().name("server-virtual-", 0).factory());
    }

    @Bean
    @Qualifier("virtualTaskExecutor")
    AsyncTaskExecutor virtualTaskExecutor(ExecutorService virtualThreadExecutor) {
        return new TaskExecutorAdapter(virtualThreadExecutor);
    }

    @Bean
    TomcatProtocolHandlerCustomizer<ProtocolHandler> protocolHandlerVirtualThreadExecutor(
            ExecutorService virtualThreadExecutor) {
        return protocolHandler -> protocolHandler.setExecutor(virtualThreadExecutor);
    }

    // Increase HTTP/2 concurrent stream capacity to avoid RST_STREAM under load
    @Bean
    TomcatProtocolHandlerCustomizer<ProtocolHandler> http2StreamCapacityCustomizer() {
        return handler -> {
            if (handler instanceof org.apache.coyote.http2.Http2Protocol h2) {
                h2.setMaxConcurrentStreams(4096);
                // Increase flow control window for large payloads
                h2.setInitialWindowSize(64 * 1024 * 1024); // 64 MB
                // Disable HTTP/2 pings to avoid "Failed to send ping" errors when clients close connections
                h2.setReadTimeout(-1); // -1 disables read timeout and associated pings
            }
        };
    }

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setDefaultTimeout(DEFAULT_ASYNC_TIMEOUT.toMillis());
        configurer.setTaskExecutor(virtualTaskExecutor);
    }

    /**
     * Bounded platform-thread pool sized to available processors for CPU-heavy PDF conversions.
     */
    @Bean(name = "pdfConversionExecutor", destroyMethod = "shutdown")
    public ExecutorService pdfConversionExecutor() {
        int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
        return Executors.newFixedThreadPool(cores, r -> {
            Thread t = new Thread(r);
            t.setName("pdf-convert-" + t.threadId());
            t.setDaemon(true);
            return t;
        });
    }

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
        return factory -> {
            factory.addConnectorCustomizers(connector -> {
                int maxSize = -1; // -1 = unlimited
                connector.setMaxPostSize(maxSize);
                log.debug("Tomcat connector customization applied: maxPostSize={}, connector={}",
                        maxSize == -1 ? "UNLIMITED" : maxSize + " bytes", connector);
            });
        };
    }
}
