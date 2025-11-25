package nl.infomedics.invoicing.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.googlecode.htmlcompressor.compressor.HtmlCompressor;

import lombok.extern.slf4j.Slf4j;
import nl.infomedics.invoicing.config.TemplateHtmlConfig;
import nl.infomedics.invoicing.model.PublishTemplateRequest;

@Slf4j
@RestController
public class TemplateController {

    private final Map<Integer, String> templateHtmlMap;
    private final Path templateDirectory;

    public TemplateController(Map<Integer, String> templateHtmlMap, Path templateDirectory) {
        this.templateHtmlMap = templateHtmlMap;
        this.templateDirectory = templateDirectory;
    }

    @PutMapping(path = "/api/templates/publish", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> publishTemplate(@RequestBody PublishTemplateRequest request) {
        if (request == null || request.getXhtmlTemplate() == null) {
            return ResponseEntity.badRequest().body("xhtmlTemplate is required");
        }
        int invoiceType = request.getInvoiceType();
        String xhtmlTemplate = request.getXhtmlTemplate();
        // Version currently ignored but accepted for future extension
        try {
            Files.createDirectories(templateDirectory);
            String filename = TemplateHtmlConfig.TEMPLATE_PATTERN.replace("*", String.valueOf(invoiceType));
            Path target = templateDirectory.resolve(filename);
            Files.writeString(target, xhtmlTemplate, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);

            TemplateHtmlConfig.reloadTemplates(templateDirectory, templateHtmlMap);
            log.info("Published template for invoiceType={} to {}", invoiceType, target.toAbsolutePath());
            return ResponseEntity.ok().build();
        } catch (IOException e) {
            log.error("Failed to publish template for invoiceType {}: {}", invoiceType, e.getMessage(), e);
            return ResponseEntity.internalServerError().body("Failed to publish template: " + e.getMessage());
        }
    }

    @PostMapping(path = "/api/templates/compress", consumes = "text/plain", produces = "text/plain")
    public ResponseEntity<String> compressTemplate(@RequestBody String htmlString) {
        HtmlCompressor compressor = new HtmlCompressor();
        compressor.setCompressCss(true);
        compressor.setRemoveIntertagSpaces(true);
        String compressed = compressor.compress(htmlString);
        return ResponseEntity.ok(compressed);
    }
}
