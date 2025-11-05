package nl.infomedics.reporting;

import nl.infomedics.reporting.service.FolderWatcherService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContext;

/**
 * Spring Boot entry point that boots the application and starts watching the input folder.
 */
@SpringBootApplication
public class ReportingApplication {

	/**
	 * Launches the Spring context, resolves the folder watcher, and enables directory monitoring.
	 *
	 * @param args standard JVM command-line arguments
	 */
	public static void main(String[] args) {
		ApplicationContext ctx = SpringApplication.run(ReportingApplication.class, args);
		ctx.getBean(FolderWatcherService.class).startWatching();
	}

}
