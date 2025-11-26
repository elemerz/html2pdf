package nl.infomedics.xhtml2pdf;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = {"nl.infomedics.xhtml2pdf", "nl.infomedics.reporting"})
public class PdfCreatorApplication {

	public static void main(String[] args) {
		// Silence OpenHTMLToPDF's JUL logging before it installs its own console handler
		System.setProperty("xr.util-logging.loggingEnabled", "false");
		SpringApplication.run(PdfCreatorApplication.class, args);
	}

}
