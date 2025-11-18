package nl.infomedics.invoicing.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@Configuration
public class TemplateHtmlConfig {
    @Bean
    public Map<Integer, String> templateHtmlMap() throws IOException {
        Map<Integer, String> map = new HashMap<>();
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources("classpath:/templates/for-pdf/factuur-*.html");
        for (Resource r : resources) {
            String filename = r.getFilename();
            if (filename == null) continue;
            int dash = filename.indexOf('-');
            int dot = filename.lastIndexOf('.');
            if (dash >= 0 && dot > dash) {
                try {
                    Integer type = Integer.valueOf(filename.substring(dash + 1, dot));
                    String html = new String(r.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                    map.put(type, html);
                } catch (Exception ignored) {
                    // Ignore malformed file names or read errors
                }
            }
        }
        return map; // return mutable map for runtime updates
    }
}
