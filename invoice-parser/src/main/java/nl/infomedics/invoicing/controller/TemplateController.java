package nl.infomedics.invoicing.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class TemplateController {
    private final Map<Integer, String> templateHtmlMap;

    public TemplateController(Map<Integer, String> templateHtmlMap) {
        this.templateHtmlMap = templateHtmlMap;
    }

    @PutMapping("/api/templates")
    public ResponseEntity<?> putTemplate(@RequestParam(name = "invoicetype") int invoiceType,
                                         @RequestParam(name = "xhtmlTemplate") String xhtmlTemplate) {
        templateHtmlMap.put(invoiceType, xhtmlTemplate);
        return ResponseEntity.ok().build();
    }
}
