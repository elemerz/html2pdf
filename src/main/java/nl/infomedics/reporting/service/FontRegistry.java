package nl.infomedics.reporting.service;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.awt.Font;
import java.awt.FontFormatException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class FontRegistry {

    private static final String FONT_RESOURCE_DIRECTORY = "fonts";
    private static final String[] FONT_EXTENSIONS = {"ttf", "otf", "ttc", "otc"};

    private final ResourcePatternResolver resourceResolver;
    private final Object fontLoadLock = new Object();
    private volatile Map<String, byte[]> cachedFontData;
    private final Map<String, Set<String>> aliasCache = new ConcurrentHashMap<>();

    public FontRegistry() {
        this(new PathMatchingResourcePatternResolver(FontRegistry.class.getClassLoader()));
    }

    FontRegistry(ResourcePatternResolver resourceResolver) {
        this.resourceResolver = resourceResolver;
    }

    public void registerEmbeddedFonts(PdfRendererBuilder builder) {
        registerFonts(builder, loadEmbeddedFontData());
    }

    public void registerFonts(PdfRendererBuilder builder, Map<String, byte[]> fonts) {
        if (builder == null || fonts == null || fonts.isEmpty()) {
            return;
        }
        for (Map.Entry<String, byte[]> entry : fonts.entrySet()) {
            String fileName = entry.getKey();
            byte[] fontBytes = entry.getValue();
            if (fontBytes == null || fontBytes.length == 0) {
                System.err.println("Skipping font " + fileName + " because it contains no data.");
                continue;
            }
            final byte[] fontBytesCopy = fontBytes;
            String cacheKey = buildAliasCacheKey(fileName, fontBytesCopy);
            Set<String> aliases = aliasCache.computeIfAbsent(cacheKey,
                    key -> deriveFontAliases(fileName, fontBytesCopy));
            if (aliases == null || aliases.isEmpty()) {
                System.err.println("Skipping font " + fileName + " because no aliases could be derived.");
                continue;
            }
            aliases.forEach(alias -> builder.useFont(() -> new ByteArrayInputStream(fontBytesCopy), alias));
        }
    }

    public Map<String, byte[]> loadEmbeddedFontData() {
        Map<String, byte[]> fonts = cachedFontData;
        if (fonts == null) {
            synchronized (fontLoadLock) {
                fonts = cachedFontData;
                if (fonts == null) {
                    fonts = Collections.unmodifiableMap(readFontsFromResources(FONT_RESOURCE_DIRECTORY));
                    cachedFontData = fonts;
                }
            }
        }
        return fonts;
    }

    private Map<String, byte[]> readFontsFromResources(String resourceFolder) {
        Map<String, byte[]> fonts = new LinkedHashMap<>();
        for (String extension : FONT_EXTENSIONS) {
            String pattern = String.format("classpath*:%s/**/*.%s", resourceFolder, extension);
            try {
                Resource[] resources = resourceResolver.getResources(pattern);
                for (Resource resource : resources) {
                    if (!resource.isReadable()) {
                        continue;
                    }
                    String filename = resource.getFilename();
                    if (filename == null || fonts.containsKey(filename)) {
                        continue;
                    }
                    try (InputStream input = resource.getInputStream()) {
                        fonts.put(filename, input.readAllBytes());
                    }
                }
            } catch (IOException e) {
                System.err.println("Unable to load font resources for pattern " + pattern + ": " + e.getMessage());
            }
        }
        return fonts;
    }

    private Set<String> deriveFontAliases(String fileName, byte[] fontBytes) {
        Set<String> aliases = new LinkedHashSet<>();
        addAliasVariant(aliases, stripExtension(fileName));
        addAliasVariant(aliases, fileName);
        if (fontBytes != null && fontBytes.length > 0) {
            try (ByteArrayInputStream input = new ByteArrayInputStream(fontBytes)) {
                Font font = Font.createFont(Font.TRUETYPE_FONT, input);
                addAliasVariant(aliases, font.getFamily(Locale.ROOT));
                addAliasVariant(aliases, font.getFontName(Locale.ROOT));
                addAliasVariant(aliases, font.getPSName());
            } catch (FontFormatException | IOException e) {
                System.err.println("Unable to read font metadata from " + fileName + ": " + e.getMessage());
            }
        }
        return Collections.unmodifiableSet(aliases);
    }

    private void addAliasVariant(Set<String> aliases, String candidate) {
        if (candidate == null) {
            return;
        }
        String trimmed = candidate.trim();
        if (trimmed.isEmpty()) {
            return;
        }
        addIfPresent(aliases, trimmed);
        if (trimmed.contains(" ")) {
            addIfPresent(aliases, trimmed.replace(' ', '_'));
            addIfPresent(aliases, trimmed.replace(' ', '-'));
        }
        if (trimmed.contains("_")) {
            addIfPresent(aliases, trimmed.replace('_', ' '));
            addIfPresent(aliases, trimmed.replace('_', '-'));
        }
        if (trimmed.contains("-")) {
            addIfPresent(aliases, trimmed.replace('-', ' '));
            addIfPresent(aliases, trimmed.replace('-', '_'));
        }
    }

    private void addIfPresent(Set<String> aliases, String candidate) {
        if (candidate == null) {
            return;
        }
        String trimmed = candidate.trim();
        if (!trimmed.isEmpty()) {
            aliases.add(trimmed);
        }
    }

    private String stripExtension(String name) {
        if (name == null) {
            return null;
        }
        int idx = name.lastIndexOf('.');
        if (idx > 0) {
            return name.substring(0, idx);
        }
        return name;
    }

    private String buildAliasCacheKey(String fileName, byte[] fontBytes) {
        return fileName + ":" + Arrays.hashCode(fontBytes);
    }
}
