package nl.infomedics.engine.core;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import lombok.extern.slf4j.Slf4j;
import nl.infomedics.invoicing.model.DebiteurWithPractitioner;

@Slf4j
@Component
public class PlaceholderResolver {

    private static final Pattern REPEAT_BLOCK_PATTERN = Pattern.compile(
            "(<([a-zA-Z0-9]+)([^>]*?data-repeat-over=\"([a-zA-Z0-9_\\.]+)\"[^>]*?data-repeat-var=\"([a-zA-Z0-9_]+)\"[^>]*?)>)([\\s\\S]*?)(</\\2>)"
    );
    
    private static final Map<String, RepeatPlan> REPEAT_PLAN_CACHE = new ConcurrentHashMap<>();
    private static final Map<String, Method> METHOD_CACHE = new ConcurrentHashMap<>();
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    public String resolve(String htmlTemplate, DebiteurWithPractitioner debiteur) {
        if (htmlTemplate == null || htmlTemplate.isEmpty() || debiteur == null) {
            return htmlTemplate;
        }

        RepeatPlan plan = REPEAT_PLAN_CACHE.computeIfAbsent(htmlTemplate, this::compileRepeatPlan);
        
        if (!plan.hasRepeat && !plan.hasPlaceholders) {
            return htmlTemplate;
        }

        try {
            return executePlan(plan, debiteur);
        } catch (Exception e) {
            log.warn("Placeholder resolution failed: {}", e.getMessage());
            return htmlTemplate;
        }
    }

    private RepeatPlan compileRepeatPlan(String html) {
        boolean hasRepeat = html.contains("data-repeat-over");
        boolean hasPlaceholders = html.contains("${");
        
        if (!hasRepeat) {
            return new RepeatPlan(hasRepeat, hasPlaceholders, List.of(), parseString(html));
        }

        List<RepeatSegment> segments = new ArrayList<>();
        Matcher matcher = REPEAT_BLOCK_PATTERN.matcher(html);
        int lastEnd = 0;

        while (matcher.find()) {
            String prefix = html.substring(lastEnd, matcher.start());
            String openingTag = matcher.group(1);
            String collectionPath = matcher.group(4);
            String varName = matcher.group(5);
            String inner = matcher.group(6);
            String closingTag = "</" + matcher.group(2) + ">";
            
            String strippedOpening = openingTag
                    .replace("data-repeat-over=\"" + collectionPath + "\"", "")
                    .replace("data-repeat-var=\"" + varName + "\"", "");
            
            segments.add(new RepeatSegment(
                    parseString(prefix),
                    strippedOpening,
                    closingTag,
                    collectionPath,
                    varName,
                    parseString(inner)
            ));
            
            lastEnd = matcher.end();
        }

        String tail = html.substring(lastEnd);
        return new RepeatPlan(true, hasPlaceholders, segments, parseString(tail));
    }

    private ParsedString parseString(String input) {
        if (input == null || input.isEmpty()) {
            return new ParsedString(List.of());
        }

        List<Token> tokens = new ArrayList<>();
        int i = 0;
        int len = input.length();

        while (i < len) {
            int start = input.indexOf("${", i);
            if (start < 0) {
                tokens.add(new Token(false, input.substring(i)));
                break;
            }
            
            if (start > i) {
                tokens.add(new Token(false, input.substring(i, start)));
            }
            
            int end = input.indexOf('}', start + 2);
            if (end < 0) {
                tokens.add(new Token(false, input.substring(start)));
                break;
            }
            
            tokens.add(new Token(true, input.substring(start + 2, end).trim()));
            i = end + 1;
        }

        return new ParsedString(tokens);
    }

    private String executePlan(RepeatPlan plan, DebiteurWithPractitioner debiteur) {
        StringBuilder output = new StringBuilder();

        if (!plan.hasRepeat) {
            resolveParsed(plan.tail, output, key -> resolveValue(debiteur, key));
            return output.toString();
        }

        for (RepeatSegment segment : plan.segments) {
            resolveParsed(segment.prefix, output, key -> resolveValue(debiteur, key));

            Object collection = resolvePath(debiteur, segment.collectionPath);
            
            if (collection instanceof Iterable<?> iterable) {
                for (Object item : iterable) {
                    processRepeatItem(segment, item, output, debiteur);
                }
            } else if (collection != null && collection.getClass().isArray()) {
                int length = java.lang.reflect.Array.getLength(collection);
                for (int i = 0; i < length; i++) {
                    Object item = java.lang.reflect.Array.get(collection, i);
                    processRepeatItem(segment, item, output, debiteur);
                }
            }
        }

        resolveParsed(plan.tail, output, key -> resolveValue(debiteur, key));
        return output.toString();
    }

    private void processRepeatItem(RepeatSegment segment, Object item, 
                                   StringBuilder output, DebiteurWithPractitioner root) {
        output.append(segment.openingTagStripped);

        for (Token token : segment.inner.tokens) {
            if (!token.isPlaceholder) {
                output.append(token.content);
            } else {
                String key = token.content;
                String value;

                if (key.startsWith(segment.varName + ".")) {
                    String path = key.substring(segment.varName.length() + 1);
                    Object obj = resolvePath(item, path);
                    value = obj != null ? obj.toString() : "";
                } else {
                    value = resolveValue(root, key);
                }

                output.append(value != null ? value : "${" + key + "}");
            }
        }

        output.append(segment.closingTag);
    }

    private void resolveParsed(ParsedString parsed, StringBuilder output, 
                              java.util.function.Function<String, String> resolver) {
        for (Token token : parsed.tokens) {
            if (!token.isPlaceholder) {
                output.append(token.content);
            } else {
                String value = resolver.apply(token.content);
                output.append(value != null ? value : "${" + token.content + "}");
            }
        }
    }

    private String resolveValue(Object root, String path) {
        Object value = resolvePath(root, path);
        return value != null ? value.toString() : "";
    }

    private Object resolvePath(Object root, String path) {
        if (root == null || path == null || path.isEmpty()) {
            return null;
        }

        Object current = root;
        for (String part : path.split("\\.")) {
            if (current == null) return null;
            
            if (current instanceof Map<?, ?> map && map.containsKey(part)) {
                current = map.get(part);
            } else {
                current = invokeProperty(current, part);
            }
        }

        return current;
    }

    private Object invokeProperty(Object obj, String name) {
        if (obj == null || name == null || name.isEmpty()) {
            return null;
        }

        Class<?> clazz = obj.getClass();
        String capital = Character.toUpperCase(name.charAt(0)) + name.substring(1);
        String keyGet = clazz.getName() + "#get" + capital;
        String keyIs = clazz.getName() + "#is" + capital;
        String keyPlain = clazz.getName() + "#" + name;

        try {
            Method method = METHOD_CACHE.get(keyGet);
            if (method == null) {
                method = clazz.getMethod("get" + capital);
                METHOD_CACHE.put(keyGet, method);
            }
            return method.invoke(obj);
        } catch (Exception ignored) {
        }

        try {
            Method method = METHOD_CACHE.get(keyIs);
            if (method == null) {
                method = clazz.getMethod("is" + capital);
                METHOD_CACHE.put(keyIs, method);
            }
            return method.invoke(obj);
        } catch (Exception ignored) {
        }

        try {
            Method method = METHOD_CACHE.get(keyPlain);
            if (method == null) {
                method = clazz.getMethod(name);
                METHOD_CACHE.put(keyPlain, method);
            }
            if (method.getParameterCount() == 0) {
                return method.invoke(obj);
            }
        } catch (Exception ignored) {
        }

        return null;
    }

    private record Token(boolean isPlaceholder, String content) {
    }

    private record ParsedString(List<Token> tokens) {
    }

    private record RepeatPlan(boolean hasRepeat, boolean hasPlaceholders,
                             List<RepeatSegment> segments, ParsedString tail) {
    }

    private record RepeatSegment(ParsedString prefix, String openingTagStripped, String closingTag,
                                String collectionPath, String varName, ParsedString inner) {
    }
}
