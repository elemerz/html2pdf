package nl.infomedics.invoicing.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Configuration
public class TemplateHtmlConfig {
    public static final String TEMPLATE_PATTERN = "factuur-*.html";

    @Value("${templates.for-pdf.path:for-pdf}")
    private String templatesPath;

    @Bean
    public Path templateDirectory() throws IOException {
        Path dir = Paths.get(templatesPath).toAbsolutePath().normalize();
        if (Files.exists(dir) && !Files.isDirectory(dir)) {
            throw new IOException("Configured template path is not a directory: " + dir);
        }
        Files.createDirectories(dir);
        return dir;
    }

    @Bean
    public Map<Integer, String> templateHtmlMap(Path templateDirectory) throws IOException {
        Map<Integer, String> map = new ConcurrentHashMap<>();
        reloadTemplates(templateDirectory, map);
        return map; // return mutable map for runtime updates
    }

    @Bean
    public TemplateHtmlWatcher templateHtmlWatcher(Path templateDirectory,
                                                   Map<Integer, String> templateHtmlMap) {
        return new TemplateHtmlWatcher(templateDirectory, () -> {
            try {
                reloadTemplates(templateDirectory, templateHtmlMap);
            } catch (IOException e) {
                log.warn("Failed to reload templates after change: {}", e.getMessage(), e);
            }
        });
    }

    public static synchronized void reloadTemplates(Path templateDirectory,
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
}
