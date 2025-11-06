package nl.infomedics.invoicing.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@NoArgsConstructor @AllArgsConstructor @Getter @Setter
@Configuration
@ConfigurationProperties(prefix = "zip")
public class AppProperties {
	private String inputFolder;
	private String archiveFolder;
	private String errorFolder;
	private int concurrentWorkers = 64;
	private int queueCapacity = 20000;
	private int pollFallbackSeconds = 30;
}
