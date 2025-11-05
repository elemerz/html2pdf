package nl.infomedics.invoicing;

import nl.infomedics.invoicing.service.FolderWatcherService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContext;

/**
 * Spring Boot entry point that boots the application and starts watching the input folder.
 */
@SpringBootApplication
public class InvoiceProcessorApplication {

	/**
	 * Launches the Spring context, resolves the folder watcher, and enables directory monitoring.
	 *
	 * @param args standard JVM command-line arguments
	 */
	public static void main(String[] args) {
		ApplicationContext ctx = SpringApplication.run(InvoiceProcessorApplication.class, args);
		ctx.getBean(FolderWatcherService.class).startWatching();
	}

}
