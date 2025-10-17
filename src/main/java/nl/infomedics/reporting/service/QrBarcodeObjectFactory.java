package nl.infomedics.reporting.service;

import com.google.zxing.BarcodeFormat;
import com.openhtmltopdf.extend.FSObjectDrawer;
import com.openhtmltopdf.objects.zxing.ZXingObjectDrawer;
import com.openhtmltopdf.render.DefaultObjectDrawerFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.awt.Color;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Object drawer factory that prepares <object> tags for ZXing rendering so that OpenHTMLtoPDF can draw
 * QR codes and 1D barcodes during layout.
 */
public class QrBarcodeObjectFactory extends DefaultObjectDrawerFactory {

    private static final String TYPE_QR = "application/qrcode";
    private static final String TYPE_BARCODE = "application/barcode";
    private static final String ATTR_TYPE = "type";
    private static final String ATTR_DATA = "data";
    private static final String ATTR_FORMAT = "format";
    private static final String ATTR_VALUE = "value";
    private static final String ATTR_MARGIN = "data-margin";
    private static final String ATTR_EC_LEVEL = "data-ec-level";
    private static final String ATTR_ON_COLOR = "data-on-color";
    private static final String ATTR_OFF_COLOR = "data-off-color";
    private static final String GENERATED_HINT_FLAG = "data-generated-by";
    private static final String FACTORY_ID = "QrBarcodeObjectFactory";
    private static final ZXingObjectDrawer ZXING_DRAWER = new ZXingObjectDrawer();

    /**
     * Registers ZXing-backed drawers for QR and 1D barcode MIME types.
     */
    public QrBarcodeObjectFactory() {
        registerDrawer(TYPE_QR, ZXING_DRAWER);
        registerDrawer(TYPE_BARCODE, ZXING_DRAWER);
    }

    /**
     * Prepares the element before delegating to the base implementation.
     */
    @Override
    public FSObjectDrawer createDrawer(Element element) {
        prepareElement(element);
        return super.createDrawer(element);
    }

    /**
     * Recognises ZXing-compatible elements even when the superclass would not treat them as replaced objects.
     */
    @Override
    public boolean isReplacedObject(Element element) {
        if (prepareElement(element)) {
            return true;
        }
        return super.isReplacedObject(element);
    }

    /**
     * Applies the QR/barcode specific adjustments to the supplied element, returning true if the element
     * represents a ZXing-compatible object.
     */
    public boolean prepareElement(Element element) {
        String type = getMimeType(element);
        if (!(TYPE_QR.equals(type) || TYPE_BARCODE.equals(type))) {
            return false;
        }
        boolean prepared = switch (type) {
            case TYPE_QR -> prepareQrCode(element);
            case TYPE_BARCODE -> prepareBarcode(element);
            default -> false;
        };
        if (!prepared) {
            return false;
        }
        propagateColorAttributes(element);
        ensureSizeStyles(element);
        return true;
    }

    /**
     * Traverses the given document and prepares all barcode related object elements in-place.
     */
    public void preprocessDocument(Document document) {
        if (document == null) {
            return;
        }
        NodeList nodes = document.getElementsByTagName("object");
        if (nodes.getLength() == 0) {
            nodes = document.getElementsByTagNameNS("*", "object");
        }
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            if (node instanceof Element element) {
                prepareElement(element);
            }
        }
    }

    /**
     * Extracts and normalises the MIME type attribute from the given element.
     *
     * @param element candidate element
     * @return lower-case MIME type or empty string
     */
    private static String getMimeType(Element element) {
        if (element == null || !element.hasAttribute(ATTR_TYPE)) {
            return "";
        }
        return element.getAttribute(ATTR_TYPE).trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Rewrites QR code specific attributes into the format expected by ZXing.
     *
     * @param element QR code element
     * @return {@code true} if sufficient data is present for rendering
     */
    private boolean prepareQrCode(Element element) {
        String value = element.getAttribute(ATTR_DATA).trim();
        if (value.isEmpty()) {
            return false;
        }
        element.setAttribute(ATTR_VALUE, value);
        element.setAttribute(ATTR_FORMAT, BarcodeFormat.QR_CODE.name());

        removeGeneratedHints(element);
        appendEncodeHint(element, "MARGIN", readMargin(element).orElse(null));
        String ecLevel = sanitizeString(element.getAttribute(ATTR_EC_LEVEL));
        if (!ecLevel.isEmpty()) {
            appendEncodeHint(element, "ERROR_CORRECTION", ecLevel.toUpperCase(Locale.ROOT));
        }
        return true;
    }

    /**
     * Normalises 1D barcode metadata, inferring format/value pairs when possible.
     *
     * @param element barcode element
     * @return {@code true} if the element contains renderable data
     */
    private boolean prepareBarcode(Element element) {
        String raw = sanitizeString(element.getAttribute(ATTR_DATA));
        if (raw.isEmpty()) {
            return false;
        }

        String format = sanitizeString(element.getAttribute("data-format"));
        String value = raw;

        int idx = raw.indexOf(':');
        if (format.isEmpty() && idx > 0) {
            format = raw.substring(0, idx).trim();
            value = raw.substring(idx + 1).trim();
        }

        if (format.isEmpty()) {
            format = BarcodeFormat.CODE_128.name();
        }

        if (value.isEmpty()) {
            value = raw;
        }

        element.setAttribute(ATTR_VALUE, value);
        element.setAttribute(ATTR_FORMAT, format.toUpperCase(Locale.ROOT));

        removeGeneratedHints(element);
        appendEncodeHint(element, "MARGIN", readMargin(element).orElse(null));
        return true;
    }

    /**
     * Parses an optional margin attribute, clamping the value to non-negative integers.
     *
     * @param element barcode element
     * @return optional stringified margin
     */
    private Optional<String> readMargin(Element element) {
        String marginAttr = sanitizeString(element.getAttribute(ATTR_MARGIN));
        if (marginAttr.isEmpty()) {
            return Optional.empty();
        }
        try {
            int margin = Integer.parseInt(marginAttr);
            return Optional.of(Integer.toString(Math.max(margin, 0)));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    /**
     * Converts optional colour overrides into the format ZXing expects.
     *
     * @param element barcode element
     */
    private void propagateColorAttributes(Element element) {
        maybePropagateColor(element, ATTR_ON_COLOR, "on-color");
        maybePropagateColor(element, ATTR_OFF_COLOR, "off-color");
    }

    /**
     * Copies a colour attribute into the ZXing-specific attribute slot when a value exists.
     *
     * @param element element to mutate
     * @param sourceAttr attribute coming from the XHTML author
     * @param targetAttr attribute consumed by ZXing
     */
    private void maybePropagateColor(Element element, String sourceAttr, String targetAttr) {
        String colorValue = sanitizeString(element.getAttribute(sourceAttr));
        if (colorValue.isEmpty()) {
            return;
        }
        Integer parsed = parseColor(colorValue);
        if (parsed != null) {
            element.setAttribute(targetAttr, Integer.toString(parsed));
        }
    }

    /**
     * Parses a CSS colour string into its RGB integer representation.
     *
     * @param color colour string (e.g. {@code #FF0000})
     * @return integer RGB value or {@code null} when parsing fails
     */
    private Integer parseColor(String color) {
        try {
            Color awtColor = Color.decode(color);
            return awtColor.getRGB();
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /**
     * Adds an encode-hint child element for ZXing when a value is supplied.
     *
     * @param element barcode element to enrich
     * @param name hint name
     * @param value hint value
     */
    private void appendEncodeHint(Element element, String name, String value) {
        if (value == null || value.isEmpty()) {
            return;
        }
        Document document = element.getOwnerDocument();
        if (document == null) {
            return;
        }

        Element hint = document.createElement("encode-hint");
        hint.setAttribute("name", name);
        hint.setAttribute("value", value);
        hint.setAttribute(GENERATED_HINT_FLAG, FACTORY_ID);
        element.appendChild(hint);
    }

    /**
     * Strips encode hints created by this factory to avoid duplicating nodes on repeated passes.
     *
     * @param element barcode element to clean
     */
    private void removeGeneratedHints(Element element) {
        List<Node> toRemove = new ArrayList<>();
        NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node node = children.item(i);
            if (node instanceof Element child) {
                if ("encode-hint".equals(child.getTagName())
                        && FACTORY_ID.equals(child.getAttribute(GENERATED_HINT_FLAG))) {
                    toRemove.add(child);
                }
            }
        }
        toRemove.forEach(element::removeChild);
    }

    /**
     * Propagates width/height attributes into inline styles so layout engines respect the intended size.
     *
     * @param element barcode element
     */
    private void ensureSizeStyles(Element element) {
        int width = parseLength(element.getAttribute("width"));
        int height = parseLength(element.getAttribute("height"));
        if (width <= 0 && height <= 0) {
            return;
        }
        StringBuilder style = new StringBuilder(sanitizeString(element.getAttribute("style")));
        if (style.length() > 0 && style.charAt(style.length() - 1) != ';') {
            style.append(';');
        }
        if (width > 0 && !styleContainsProperty(style, "width")) {
            style.append("width:").append(width).append("px;");
        }
        if (height > 0 && !styleContainsProperty(style, "height")) {
            style.append("height:").append(height).append("px;");
        }
        if (!styleContainsProperty(style, "display")) {
            style.append("display:inline-block;");
        }
        element.setAttribute("style", style.toString());
    }

    /**
     * Parses an integer pixel length from an attribute, tolerating an optional {@code px} suffix.
     *
     * @param attr raw attribute value
     * @return parsed length or {@code -1} when missing/invalid
     */
    private int parseLength(String attr) {
        String value = sanitizeString(attr);
        if (value.endsWith("px")) {
            value = value.substring(0, value.length() - 2).trim();
        }
        if (value.isEmpty()) {
            return -1;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    /**
     * Checks whether the style buffer already contains the specified property.
     *
     * @param style style buffer to inspect
     * @param property property name
     * @return {@code true} if the property exists
     */
    private boolean styleContainsProperty(StringBuilder style, String property) {
        String lower = style.toString().toLowerCase(Locale.ROOT);
        return lower.contains(property.toLowerCase(Locale.ROOT) + ":");
    }

    /**
     * Trims the supplied string and converts {@code null} to an empty string.
     *
     * @param input raw input
     * @return trimmed string or empty string when {@code null}
     */
    private String sanitizeString(String input) {
        return input == null ? "" : input.trim();
    }
}
