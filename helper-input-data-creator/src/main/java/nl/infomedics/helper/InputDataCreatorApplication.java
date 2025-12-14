package nl.infomedics.helper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@Slf4j
@SpringBootApplication
@EnableConfigurationProperties(DataGeneratorConfig.class)
public class InputDataCreatorApplication implements CommandLineRunner {

    private final DataGeneratorService dataGeneratorService;
    private final DataGeneratorConfig config;

    public InputDataCreatorApplication(DataGeneratorService dataGeneratorService, DataGeneratorConfig config) {
        this.dataGeneratorService = dataGeneratorService;
        this.config = config;
    }

    public static void main(String[] args) {
        SpringApplication.run(InputDataCreatorApplication.class, args);
    }

    @Override
    public void run(String... args) {
        log.info("Starting Input Data Creator Helper");
        log.info("Output folder: {}", config.getOutputFolder());
        log.info("Continuous mode: {}", config.isContinuousMode());
        log.info("Batch size: {} to {} files", config.getBatchMinCount(), config.getBatchMaxCount());
        log.info("Delay between batches: {} to {} ms", config.getDelayMinMs(), config.getDelayMaxMs());
        
        if (config.isContinuousMode()) {
            dataGeneratorService.runContinuously();
        } else {
            dataGeneratorService.generateBatch();
        }
    }
}
