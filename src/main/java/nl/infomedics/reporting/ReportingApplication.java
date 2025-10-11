package nl.infomedics.reporting;

import nl.infomedics.reporting.service.Html2PdfConverterService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContext;

@SpringBootApplication
public class ReportingApplication {

	public static void main(String[] args) {
		ApplicationContext ctx = SpringApplication.run(ReportingApplication.class, args);
		ctx.getBean(Html2PdfConverterService.class).startWatching();
	}

}
