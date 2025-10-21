package nl.infomedics.reporting;

import nl.infomedics.reporting.service.Html2PdfConverterService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContext;

/**
 * Spring Boot entry point that boots the HTML-to-PDF conversion service and starts watching the input folder.
 */
@SpringBootApplication
public class ReportingApplication {

	/**
	 * Launches the Spring context, resolves the conversion service, and enables directory watching.
	 *
	 * @param args standard JVM command-line arguments
	 */
	public static void main(String[] args) {
		ApplicationContext ctx = SpringApplication.run(ReportingApplication.class, args);
		ctx.getBean(Html2PdfConverterService.class).startWatching();
	}

}
