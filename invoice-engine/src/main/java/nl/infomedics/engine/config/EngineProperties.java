package nl.infomedics.engine.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "engine")
public class EngineProperties {

    private Threading threading = new Threading();
    private Watch watch = new Watch();
    private Pdf pdf = new Pdf();
    private Input input = new Input();
    private Output output = new Output();
    private Metrics metrics = new Metrics();

    @Getter
    @Setter
    public static class Threading {
        private int cpuPoolSize = 0; // 0 = auto (CPU_CORES * 2)
        private int ioPoolSize = -1; // -1 = unlimited virtual threads
        private int parsingPoolSize = 0; // 0 = auto (work-stealing)
    }

    @Getter
    @Setter
    public static class Watch {
        private int debounceMillis = 100;
        private int batchSize = 50;
        private boolean useNativeEvents = true;
        private int fallbackPollSeconds = 30;
    }

    @Getter
    @Setter
    public static class Pdf {
        private int maxConcurrent = 32;
        private boolean enableTemplateCache = true;
        private int bufferPoolSize = 128;
        private boolean enableBufferReuse = true;
    }

    @Getter
    @Setter
    public static class Input {
        private String folder = "C:/invoice-data/_input";
        private String archiveFolder = "C:/invoice-data/_archive";
        private String errorFolder = "C:/invoice-data/_error";
    }

    @Getter
    @Setter
    public static class Output {
        private String pdfFolder = "C:/invoice-data/_pdf";
        private String jsonFolder = "C:/invoice-data/_json";
        private boolean saveJson = false;
        private boolean prettyPrintJson = false;
    }

    @Getter
    @Setter
    public static class Metrics {
        private boolean enabled = true;
        private boolean detailedTiming = true;
    }
}
