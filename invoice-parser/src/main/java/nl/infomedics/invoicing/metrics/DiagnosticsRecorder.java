package nl.infomedics.invoicing.metrics;

import java.time.Duration;
import java.util.Map;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * Lightweight, feature-flagged wrapper for recording diagnostic timers.
 * Disabled by default to avoid overhead; enable with diagnostics.metrics.enabled=true.
 */
@Component
public class DiagnosticsRecorder {

    private final MeterRegistry registry;
    private final boolean enabled;

    public DiagnosticsRecorder(ObjectProvider<MeterRegistry> registryProvider,
                               @Value("${diagnostics.metrics.enabled:false}") boolean enabled) {
        MeterRegistry reg = registryProvider.getIfAvailable(SimpleMeterRegistry::new);
        this.registry = reg;
        this.enabled = enabled;
    }

    public SampleTimer start(String name, Map<String, String> tags) {
        if (!enabled) {
            return SampleTimer.noop();
        }
        Tags micrometerTags = tags == null ? Tags.empty() : Tags.of(tags.entrySet().stream()
                .flatMap(e -> java.util.stream.Stream.of(e.getKey(), String.valueOf(e.getValue())))
                .toArray(String[]::new));
        return new SampleTimer(name, micrometerTags, registry);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public static final class SampleTimer implements AutoCloseable {
        private static final SampleTimer NOOP = new SampleTimer(null, Tags.empty(), null, false);

        private final String name;
        private final Tags tags;
        private final long startNanos;
        private final boolean active;
        private final MeterRegistry registry;

        public static SampleTimer noop() {
            return NOOP;
        }

        private SampleTimer(String name, Tags tags, MeterRegistry registry) {
            this(name, tags, registry, true);
        }

        private SampleTimer(String name, Tags tags, MeterRegistry registry, boolean active) {
            this.name = name;
            this.tags = tags;
            this.registry = registry;
            this.startNanos = active ? System.nanoTime() : 0L;
            this.active = active;
        }

        @Override
        public void close() {
            if (!active || registry == null) {
                return;
            }
            long duration = System.nanoTime() - startNanos;
            registry.timer(name, tags).record(Duration.ofNanos(duration));
        }
    }
}
