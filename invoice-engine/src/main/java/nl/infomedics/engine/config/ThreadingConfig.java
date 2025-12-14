package nl.infomedics.engine.config;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Configuration
public class ThreadingConfig {

    private final EngineProperties properties;

    public ThreadingConfig(EngineProperties properties) {
        this.properties = properties;
    }

    @Bean(name = "ioExecutor", destroyMethod = "shutdown")
    public ExecutorService ioVirtualExecutor() {
        log.info("Creating I/O Virtual Thread Executor (unlimited capacity)");
        return Executors.newThreadPerTaskExecutor(
            Thread.ofVirtual()
                .name("io-vt-", 0)
                .factory()
        );
    }

    @Bean(name = "cpuExecutor", destroyMethod = "shutdown")
    public ExecutorService cpuPlatformExecutor() {
        int cores = Runtime.getRuntime().availableProcessors();
        int poolSize = properties.getThreading().getCpuPoolSize();
        
        if (poolSize <= 0) {
            poolSize = cores;
        }
        
        log.info("Creating PDF Conversion Thread Pool: size={}", poolSize);
        
        return Executors.newFixedThreadPool(poolSize, r -> {
            Thread t = new Thread(r);
            t.setName("pdf-convert-" + t.threadId());
            t.setDaemon(true);
            return t;
        });
    }

    @Bean(name = "parsingExecutor", destroyMethod = "shutdown")
    public ExecutorService parsingExecutor() {
        int parallelism = properties.getThreading().getParsingPoolSize();
        
        if (parallelism <= 0) {
            parallelism = Runtime.getRuntime().availableProcessors();
        }
        
        log.info("Creating Work-Stealing Parsing Pool: parallelism={}", parallelism);
        
        return Executors.newWorkStealingPool(parallelism);
    }

    private ThreadFactory createThreadFactory(String prefix) {
        AtomicInteger counter = new AtomicInteger();
        return runnable -> {
            Thread thread = new Thread(runnable);
            thread.setName(prefix + counter.getAndIncrement());
            thread.setDaemon(true);
            return thread;
        };
    }
}
