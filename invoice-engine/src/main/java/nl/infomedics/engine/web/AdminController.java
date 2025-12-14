package nl.infomedics.engine.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import lombok.extern.slf4j.Slf4j;
import nl.infomedics.engine.core.TemplateManager;

import java.util.Map;

/**
 * REST endpoints for fe-designer integration.
 * Placeholder for future implementation of:
 * - Template publishing from fe-designer
 * - Font management
 * - Logo image management
 * - Template validation
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final TemplateManager templateManager;

    public AdminController(TemplateManager templateManager) {
        this.templateManager = templateManager;
    }

    /**
     * Reload templates from disk.
     * Useful after fe-designer publishes new templates.
     */
    @PostMapping("/templates/reload")
    public ResponseEntity<Map<String, String>> reloadTemplates() {
        log.info("Reloading templates via admin endpoint");
        templateManager.reloadTemplates();
        return ResponseEntity.ok(Map.of(
                "status", "success",
                "message", "Templates reloaded successfully"
        ));
    }

    /**
     * Get template by invoice type.
     */
    @GetMapping("/templates/{invoiceType}")
    public ResponseEntity<Map<String, String>> getTemplate(@PathVariable Integer invoiceType) {
        String template = templateManager.getTemplate(invoiceType);
        if (template == null || template.isBlank()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of(
                "invoiceType", invoiceType.toString(),
                "template", template
        ));
    }

    /**
     * Placeholder: Upload template from fe-designer.
     * TODO: Implement in Phase 2
     */
    @PostMapping("/templates/{invoiceType}")
    public ResponseEntity<Map<String, String>> uploadTemplate(
            @PathVariable Integer invoiceType,
            @RequestBody String templateContent) {
        log.info("Template upload requested for invoice type {} (not yet implemented)", invoiceType);
        return ResponseEntity.ok(Map.of(
                "status", "pending",
                "message", "Template upload will be implemented in Phase 2"
        ));
    }

    /**
     * Placeholder: Font management endpoint.
     * TODO: Implement in Phase 2
     */
    @GetMapping("/fonts")
    public ResponseEntity<Map<String, String>> listFonts() {
        log.info("Font list requested (not yet implemented)");
        return ResponseEntity.ok(Map.of(
                "status", "pending",
                "message", "Font management will be implemented in Phase 2"
        ));
    }

    /**
     * Placeholder: Logo image management endpoint.
     * TODO: Implement in Phase 2
     */
    @GetMapping("/logos")
    public ResponseEntity<Map<String, String>> listLogos() {
        log.info("Logo list requested (not yet implemented)");
        return ResponseEntity.ok(Map.of(
                "status", "pending",
                "message", "Logo management will be implemented in Phase 2"
        ));
    }
}
