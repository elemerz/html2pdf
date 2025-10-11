package nl.infomedics.reporting.service;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.file.*;
import java.util.concurrent.Executors;

@Service
public class Html2PdfConverterService {

    @Value("${input.path.html}")
    private String htmlInputPath;

    @Value("${output.path.pdf}")
    private String pdfOutputPath;

    public void startWatching() {
        Executors.newSingleThreadExecutor().execute(this::watchFolder);
    }

    private void watchFolder() {
        try (WatchService watchService = FileSystems.getDefault().newWatchService()) {
            Path inputDir = Paths.get(htmlInputPath);
            inputDir.register(watchService, StandardWatchEventKinds.ENTRY_CREATE);

            System.out.println("Watching folder: " + htmlInputPath);
            while (true) {
                WatchKey key = watchService.take();

                for (WatchEvent<?> event : key.pollEvents()) {
                    if (event.kind() == StandardWatchEventKinds.ENTRY_CREATE) {
                        Path filename = (Path) event.context();
                        String fileName2 = filename.toString().toLowerCase();
						if (fileName2.endsWith(".html") || fileName2.endsWith(".xhtml")) {
                            Path htmlFile = inputDir.resolve(filename);
                            convertHtmlToPdf(htmlFile);
                        }
                    }
                }
                key.reset();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void convertHtmlToPdf(Path htmlFile) {
        try {
            String baseName = htmlFile.getFileName().toString().replaceAll("\\.html$", "");
            Path pdfFile = Paths.get(pdfOutputPath, baseName + ".pdf");

            try (OutputStream os = new FileOutputStream(pdfFile.toFile())) {
                PdfRendererBuilder builder = new PdfRendererBuilder();
                builder.useFastMode();
                builder.useSVGDrawer(new BatikSVGDrawer());
                builder.usePdfAConformance(PdfRendererBuilder.PdfAConformance.NONE);
                builder.withFile(htmlFile.toFile());
                builder.toStream(os);
                builder.run();
            }
            System.out.println("Converted: " + htmlFile + " -> " + pdfFile);
        } catch (Exception e) {
            System.err.println("Error converting " + htmlFile + ": " + e.getMessage());
        }
    }
}
