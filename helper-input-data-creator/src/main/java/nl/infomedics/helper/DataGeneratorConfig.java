package nl.infomedics.helper;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@Data
@ConfigurationProperties(prefix = "data-generator")
public class DataGeneratorConfig {
    
    private String outputFolder;
    private int batchMinCount;
    private int batchMaxCount;
    private int invoiceMinCount;
    private int invoiceMaxCount;
    private long delayMinMs;
    private long delayMaxMs;
    private long interFileDelayMinMs;
    private long interFileDelayMaxMs;
    private long markerDelayMs;
    private String modelType;
    private boolean continuousMode;
    private List<Integer> invoiceTypes;
}
