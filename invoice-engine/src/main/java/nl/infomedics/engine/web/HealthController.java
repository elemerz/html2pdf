package nl.infomedics.engine.web;

import java.time.Instant;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.extern.slf4j.Slf4j;
import nl.infomedics.engine.creator.PdfConverterService;

@Slf4j
@RestController
@RequestMapping("/api/v1")
public class HealthController {

    private final PdfConverterService pdfConverter;
    private final Instant startTime;

    public HealthController(PdfConverterService pdfConverter) {
        this.pdfConverter = pdfConverter;
        this.startTime = Instant.now();
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> health = Map.of(
                "status", "UP",
                "timestamp", Instant.now(),
                "uptime", Instant.now().getEpochSecond() - startTime.getEpochSecond() + "s",
                "version", "0.0.1-SNAPSHOT"
        );
        return ResponseEntity.ok(health);
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status() {
        Map<String, Object> status = Map.of(
                "status", "UP",
                "pdf", Map.of(
                        "activeConversions", pdfConverter.getActiveConversions(),
                        "peakConversions", pdfConverter.getPeakConversions()
                ),
                "system", Map.of(
                        "processors", Runtime.getRuntime().availableProcessors(),
                        "memoryUsed", (Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory()) / 1024 / 1024 + "MB",
                        "memoryMax", Runtime.getRuntime().maxMemory() / 1024 / 1024 + "MB"
                )
        );
        log.debug("Status check: {}", status);
        return ResponseEntity.ok(status);
    }
}
