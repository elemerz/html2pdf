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
 * Configures embedded Tomcat and MVC async handling to leverage virtual threads.
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

    @Override
    public void configureAsyncSupport(AsyncSupportConfigurer configurer) {
        configurer.setDefaultTimeout(DEFAULT_ASYNC_TIMEOUT.toMillis());
        configurer.setTaskExecutor(virtualTaskExecutor);
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
