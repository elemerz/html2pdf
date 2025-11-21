package nl.infomedics.invoicing.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.googlecode.htmlcompressor.compressor.HtmlCompressor;

import java.util.Map;

@RestController
public class TemplateController {
    private final Map<Integer, String> templateHtmlMap;

    public TemplateController(Map<Integer, String> templateHtmlMap) {
        this.templateHtmlMap = templateHtmlMap;
    }

    @PutMapping("/api/templates")
    public ResponseEntity<?> putTemplate(@RequestParam(name = "invoicetype") int invoiceType,
                                         @RequestParam(name = "xhtmlTemplate") String xhtmlTemplate,
                                         @RequestParam(name = "version", required = false) String version) {
        // Version currently ignored but accepted for future extension
        templateHtmlMap.put(invoiceType, xhtmlTemplate);
        return ResponseEntity.ok().build();
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
