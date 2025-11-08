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

/**
 * Loads and caches font resources shipped with the application, exposing them to the PDF renderer.
 */
@Component
public class FontRegistry {

    private static final String FONT_RESOURCE_DIRECTORY = "fonts";
    private static final String[] FONT_EXTENSIONS = {"ttf", "otf", "ttc", "otc"};

    private final ResourcePatternResolver resourceResolver;
    private final Object fontLoadLock = new Object();
    private volatile Map<String, byte[]> cachedFontData;
    private final Map<String, Set<String>> aliasCache = new ConcurrentHashMap<>();

    /**
     * Creates a registry backed by a classpath-aware resource resolver.
     */
    public FontRegistry() {
        this(new PathMatchingResourcePatternResolver(FontRegistry.class.getClassLoader()));
    }

    /**
     * Visible for testing constructor that accepts a custom resource resolver.
     *
     * @param resourceResolver resolver used to locate font resources
     */
    FontRegistry(ResourcePatternResolver resourceResolver) {
        this.resourceResolver = resourceResolver;
    }

    /**
     * Registers all embedded fonts with the renderer builder.
     *
     * @param builder PDF renderer builder used during conversion
     */
    public void registerEmbeddedFonts(PdfRendererBuilder builder) {
        Map<String, byte[]> fonts = loadEmbeddedFontData();
        registerFonts(builder, fonts);
        registerFallbackAliases(builder, fonts);
    }

    /**
     * Registers the provided raw font map with the renderer builder.
     *
     * @param builder target renderer builder
     * @param fonts   map of file name to raw font bytes
     */
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
            Set<String> aliases = aliasCache.computeIfAbsent(cacheKey, _ -> deriveFontAliases(fileName, fontBytesCopy));
            if (aliases == null || aliases.isEmpty()) {
                System.err.println("Skipping font " + fileName + " because no aliases could be derived.");
                continue;
            }
            aliases.forEach(alias -> builder.useFont(() -> new ByteArrayInputStream(fontBytesCopy), alias));
        }
    }

    /**
     * Lazily loads the embedded font data from the classpath, caching the result for reuse.
     *
     * @return immutable map of font file names to bytes
     */
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

    /**
     * Reads fonts from the specified classpath folder, supporting multiple font file extensions.
     *
     * @param resourceFolder classpath folder to scan
     * @return ordered map of file name to raw bytes
     */
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

    /**
     * Determines all meaningful aliases for the supplied font so it can be referenced by name in CSS.
     *
     * @param fileName font file name
     * @param fontBytes font data
     * @return immutable set of aliases
     */
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

    /**
     * Registers the provided alias and typical separator variants.
     *
     * @param aliases collection to mutate
     * @param candidate base alias
     */
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

    /**
     * Adds the candidate string to the collection when non-empty.
     *
     * @param aliases target alias set
     * @param candidate alias to consider
     */
    private void addIfPresent(Set<String> aliases, String candidate) {
        if (candidate == null) {
            return;
        }
        String trimmed = candidate.trim();
        if (!trimmed.isEmpty()) {
            aliases.add(trimmed);
        }
    }

    /**
     * Removes a file extension from the supplied name.
     *
     * @param name font file name
     * @return base name without extension
     */
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

    /**
     * Builds a cache key for the alias cache using the file name and content hash.
     *
     * @param fileName font file name
     * @param fontBytes font data
     * @return alias cache key
     */
    private String buildAliasCacheKey(String fileName, byte[] fontBytes) {
        return fileName + ":" + Arrays.hashCode(fontBytes);
    }

    private static final Map<String, String> DEFAULT_FONT_ALIASES = Map.of(
            "Arial", "Roboto-Regular.ttf",
            "Helvetica", "Roboto-Regular.ttf",
            "sans-serif", "Roboto-Regular.ttf"
    );

    private void registerFallbackAliases(PdfRendererBuilder builder, Map<String, byte[]> fonts) {
        if (builder == null || fonts == null || fonts.isEmpty()) {
            return;
        }
        DEFAULT_FONT_ALIASES.forEach((alias, backingFont) -> {
            byte[] fontData = fonts.get(backingFont);
            if (fontData == null || fontData.length == 0) {
                System.err.println("Fallback font mapping for " + alias + " references missing font " + backingFont);
                return;
            }
            registerAliasVariants(builder, alias, fontData);
        });
    }

    private void registerAliasVariants(PdfRendererBuilder builder, String alias, byte[] fontData) {
        if (alias == null || alias.isBlank() || builder == null || fontData == null || fontData.length == 0) {
            return;
        }
        Set<String> variants = buildAliasVariants(alias);
        for (String name : variants) {
            builder.useFont(() -> new ByteArrayInputStream(fontData), name, 400,
                    PdfRendererBuilder.FontStyle.NORMAL, true);
            builder.useFont(() -> new ByteArrayInputStream(fontData), name, 700,
                    PdfRendererBuilder.FontStyle.NORMAL, true);
            builder.useFont(() -> new ByteArrayInputStream(fontData), name, 400,
                    PdfRendererBuilder.FontStyle.ITALIC, true);
            builder.useFont(() -> new ByteArrayInputStream(fontData), name, 700,
                    PdfRendererBuilder.FontStyle.ITALIC, true);
        }
    }

    private Set<String> buildAliasVariants(String alias) {
        Set<String> variants = new LinkedHashSet<>();
        addAliasVariant(variants, alias);
        addAliasVariant(variants, alias.toLowerCase(Locale.ROOT));
        addAliasVariant(variants, alias.toUpperCase(Locale.ROOT));
        return variants;
    }
}
