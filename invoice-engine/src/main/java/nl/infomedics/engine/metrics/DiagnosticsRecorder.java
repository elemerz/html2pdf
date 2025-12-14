package nl.infomedics.engine.metrics;

import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import lombok.extern.slf4j.Slf4j;
import nl.infomedics.engine.config.EngineProperties;

@Slf4j
@Component
public class DiagnosticsRecorder {

    private final MeterRegistry registry;
    private final boolean enabled;
    private final boolean detailedTiming;

    public DiagnosticsRecorder(ObjectProvider<MeterRegistry> registryProvider,
                               EngineProperties properties) {
        MeterRegistry reg = registryProvider.getIfAvailable(SimpleMeterRegistry::new);
        this.registry = reg;
        this.enabled = properties.getMetrics().isEnabled();
        this.detailedTiming = properties.getMetrics().isDetailedTiming();
        
        if (enabled) {
            log.info("Diagnostics recording enabled (detailed timing: {})", detailedTiming);
        } else {
            log.info("Diagnostics recording disabled");
        }
    }

    public SampleTimer start(String name, Map<String, String> tags) {
        if (!enabled) {
            return SampleTimer.noop();
        }
        Tags micrometerTags = tags == null ? Tags.empty() : Tags.of(tags.entrySet().stream()
                .flatMap(e -> java.util.stream.Stream.of(e.getKey(), String.valueOf(e.getValue())))
                .toArray(String[]::new));
        return new SampleTimer(name, micrometerTags, registry, detailedTiming);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public static final class SampleTimer implements AutoCloseable {
        private static final SampleTimer NOOP = new SampleTimer(null, Tags.empty(), null, false, false);

        private final String name;
        private final Tags tags;
        private final long startNanos;
        private final boolean active;
        private final boolean logTiming;
        private final MeterRegistry registry;

        public static SampleTimer noop() {
            return NOOP;
        }

        private SampleTimer(String name, Tags tags, MeterRegistry registry, boolean logTiming) {
            this(name, tags, registry, true, logTiming);
        }

        private SampleTimer(String name, Tags tags, MeterRegistry registry, boolean active, boolean logTiming) {
            this.name = name;
            this.tags = tags;
            this.registry = registry;
            this.startNanos = active ? System.nanoTime() : 0L;
            this.active = active;
            this.logTiming = logTiming;
        }

        @Override
        public void close() {
            if (!active || registry == null) {
                return;
            }
            long duration = System.nanoTime() - startNanos;
            registry.timer(name, tags).record(Duration.ofNanos(duration));
            
            if (logTiming) {
                log.debug("{} completed in {} ms (tags: {})", name, duration / 1_000_000, tags);
            }
        }
    }
}
