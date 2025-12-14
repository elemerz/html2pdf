package nl.infomedics.engine.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Component
public class TemplateManager {

    public static final String TEMPLATE_PATTERN = "factuur-*.html";

    @Value("${templates.for-pdf.path:for-pdf}")
    private String templatesPath;

    private Path templateDirectory;
    private final Map<Integer, String> templateCache = new ConcurrentHashMap<>();

    @PostConstruct
    public void initialize() throws IOException {
        templateDirectory = Paths.get(templatesPath).toAbsolutePath().normalize();
        if (Files.exists(templateDirectory) && !Files.isDirectory(templateDirectory)) {
            throw new IOException("Configured template path is not a directory: " + templateDirectory);
        }
        Files.createDirectories(templateDirectory);
        loadTemplates();
    }

    @Bean
    public Map<Integer, String> templateHtmlMap() {
        return templateCache;
    }

    public void loadTemplates() {
        try {
            reloadTemplates(templateDirectory, templateCache);
            
            if (templateCache.isEmpty()) {
                log.warn("No templates found in {}. Creating default template.", templateDirectory);
                createDefaultTemplate();
            }

        } catch (IOException e) {
            log.error("Failed to load templates", e);
        }
    }

    private static synchronized void reloadTemplates(Path templateDirectory,
                                                    Map<Integer, String> target) throws IOException {
        Map<Integer, String> fresh = new HashMap<>();
        if (!Files.isDirectory(templateDirectory)) {
            log.warn("Template directory {} does not exist; clearing in-memory templates", templateDirectory);
        } else {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(templateDirectory, TEMPLATE_PATTERN)) {
                for (Path path : stream) {
                    String filename = path.getFileName().toString();
                    int dash = filename.indexOf('-');
                    int dot = filename.lastIndexOf('.');
                    if (dash >= 0 && dot > dash) {
                        try {
                            Integer type = Integer.valueOf(filename.substring(dash + 1, dot));
                            String html = Files.readString(path, StandardCharsets.UTF_8);
                            fresh.put(type, html);
                        } catch (Exception e) {
                            log.warn("Skipping template {}: {}", filename, e.getMessage());
                        }
                    }
                }
            }
        }
        target.clear();
        target.putAll(fresh);
        log.info("Loaded {} HTML template(s) from {}", fresh.size(), templateDirectory.toAbsolutePath());
    }

    public String getTemplate(Integer invoiceType) {
        if (invoiceType == null) {
            invoiceType = 1;
        }

        String template = templateCache.get(invoiceType);
        
        if (template == null) {
            log.warn("Template not found for invoice type {}, trying default (type 1)", invoiceType);
            template = templateCache.get(1);
        }

        if (template == null) {
            log.error("No default template (type 1) available!");
            createDefaultTemplate();
            template = templateCache.get(1);
        }

        return template;
    }

    public void reloadTemplates() {
        log.info("Reloading templates...");
        try {
            reloadTemplates(templateDirectory, templateCache);
        } catch (IOException e) {
            log.error("Failed to reload templates", e);
        }
    }

    private void createDefaultTemplate() {
        String defaultTemplate = """
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8"/>
    <title>Invoice</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .info { margin-bottom: 20px; }
        .label { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Invoice</h1>
    </div>
    <div class="info">
        <p><span class="label">Invoice Number:</span> ${debiteur.invoiceNumber}</p>
        <p><span class="label">Patient:</span> ${debiteur.patientName}</p>
        <p><span class="label">Date:</span> ${debiteur.printDate}</p>
        <p><span class="label">Amount:</span> ${debiteur.totalAmount}</p>
    </div>
    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Code</th>
                <th>Description</th>
                <th>Amount</th>
            </tr>
        </thead>
        <tbody data-repeat-over="treatments" data-repeat-var="item">
            <tr>
                <td>${item.date}</td>
                <td>${item.code}</td>
                <td>${item.description}</td>
                <td>${item.amount}</td>
            </tr>
        </tbody>
    </table>
</body>
</html>
""";

        templateCache.put(1, defaultTemplate);
        
        try {
            Path defaultPath = templateDirectory.resolve("factuur-1.html");
            Files.writeString(defaultPath, defaultTemplate, StandardCharsets.UTF_8);
            log.info("Created default template at: {}", defaultPath);
        } catch (IOException e) {
            log.error("Failed to write default template", e);
        }
    }
}
