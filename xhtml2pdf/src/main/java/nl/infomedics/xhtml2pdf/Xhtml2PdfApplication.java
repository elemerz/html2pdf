package nl.infomedics.xhtml2pdf;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = {"nl.infomedics.xhtml2pdf", "nl.infomedics.reporting"})
public class Xhtml2PdfApplication {

	public static void main(String[] args) {
		SpringApplication.run(Xhtml2PdfApplication.class, args);
	}

}
