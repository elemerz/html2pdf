package nl.infomedics.helper;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Slf4j
@Component
public class ClassicDataGenerator {

    private static final Random random = new Random();
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("dd-MM-yyyy");
    private static final DateTimeFormatter DATE_FORMATTER_ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    
    private static final String[] INSURERS = {
        "Testverzekeraar Noord", "Testverzekeraar Zuid", 
        "Zilveren Kruis Achmea Zorgverzekeringen NV", "CZ groep Zorgverzekeringen"
    };
    private static final String[] CITIES = {
        "VECOZOTESTCITY", "ALMERE", "EMMELOORD", "DIEMEN", "AMSTERDAM", "UTRECHT"
    };
    private static final String[] STREETS = {
        "VecozoTestStreet", "Antaresstraat", "Lindelaan", "DIEMERKADE", "P.J. Oudweg"
    };
    private static final String[] PRACTICE_NAMES = {
        "Tandarts Sterrenwijk", "TA_Reserved_1_Pharmaceutical_Compleet", 
        "Huisartsenpraktijk Centrum", "Fysiotherapie Plus"
    };
    private static final String[] PATIENT_FIRST_NAMES = {
        "GH", "NJ", "M", "B", "D", "P", "J", "K"
    };
    private static final String[] PATIENT_LAST_NAMES = {
        "Hoeveren-van der Goes", "Albers-De Jong", "Duijkers", "Meerkers", 
        "ARENDS", "FRERIKS", "Jansen", "De Vries"
    };
    private static final String[] TREATMENT_CODES = {
        "2044", "6723", "5507", "1099", "4250", "1506", "3550"
    };
    private static final String[] POSTCODE_LETTERS = {
        "AA", "AB", "AC", "AD", "AE", "BA", "BB", "BC", "BD", "BE", 
        "XA", "XB", "XC", "XX", "ZA", "ZB", "ZC", "ZZ"
    };

    public void generateClassicZip(Path zipPath, String folderName, int invoiceType, int invoiceCount) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            String[] insuredIds = new String[invoiceCount];
            long totalAmount = 0;
            
            String debiteurenContent = generateDebiteurenFile(invoiceCount, invoiceType, insuredIds);
            totalAmount = calculateTotalAmount(debiteurenContent, invoiceCount);
            
            zos.putNextEntry(new ZipEntry(folderName + "TPG_Debiteuren.txt"));
            zos.write(debiteurenContent.getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
            
            String specificatiesContent = generateSpecificatiesFile(insuredIds);
            zos.putNextEntry(new ZipEntry(folderName + "TPG_Specificaties.txt"));
            zos.write(specificatiesContent.getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
            
            String metaContent = generateMetaFile(invoiceType, invoiceCount, totalAmount / 100.0);
            zos.putNextEntry(new ZipEntry(folderName + "TPG_Meta.txt"));
            zos.write(metaContent.getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
        }
        
        // Write to a temp file and atomically move to final name to ensure observers never see a partial ZIP
        byte[] bytes = baos.toByteArray();
        Path tempPath = zipPath.resolveSibling(zipPath.getFileName().toString() + ".part");
        try (FileChannel channel = FileChannel.open(tempPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
            channel.write(ByteBuffer.wrap(bytes));
            channel.force(true); // fsync data to disk
        }
        try {
            Files.move(tempPath, zipPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException ex) {
            Files.move(tempPath, zipPath, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private String generateMetaFile(int invoiceType, int count, double totalAmount) {
        StringBuilder sb = new StringBuilder();
        
        int[] validTypes = generateValidTypeArray();
        for (int typeNum : validTypes) {
            if (typeNum == invoiceType) {
                sb.append("# type ").append(typeNum).append(" : ").append(count).append("\n");
            } else {
                sb.append("# type ").append(typeNum).append(" : 0\n");
            }
        }
        
        sb.append("# bedrag : ").append(String.format("%.2f", totalAmount).replace('.', ',')).append("\n");
        
        return sb.toString();
    }

    private int[] generateValidTypeArray() {
        List<Integer> types = new ArrayList<>();
        for (int i = 1; i <= 30; i++) types.add(i);
        types.addAll(Arrays.asList(32, 33, 34, 36));
        for (int i = 40; i <= 45; i++) types.add(i);
        types.addAll(Arrays.asList(50, 51));
        for (int i = 64; i <= 68; i++) types.add(i);
        return types.stream().mapToInt(Integer::intValue).toArray();
    }

    private String generateDebiteurenFile(int count, int invoiceType, String[] insuredIds) {
        StringBuilder sb = new StringBuilder();
        
        for (int i = 0; i < count; i++) {
            int invoiceNr = random.nextInt(900000000) + 100000000;
            String insuredId = invoiceType + "300148" + String.format("%06d", random.nextInt(700000) + 300000) + "071";
            insuredIds[i] = insuredId;
            
            String patientName = PATIENT_FIRST_NAMES[random.nextInt(PATIENT_FIRST_NAMES.length)] + " " +
                               PATIENT_LAST_NAMES[random.nextInt(PATIENT_LAST_NAMES.length)];
            String insurer = INSURERS[random.nextInt(INSURERS.length)];
            String street = STREETS[random.nextInt(STREETS.length)];
            int houseNr = random.nextInt(200) + 1;
            String postcode = String.format("%04d", random.nextInt(9000) + 1000) + 
                            POSTCODE_LETTERS[random.nextInt(POSTCODE_LETTERS.length)];
            String city = CITIES[random.nextInt(CITIES.length)];
            String practiceName = patientName;
            
            LocalDate dateFrom = LocalDate.now().minusDays(random.nextInt(90));
            String dateTo = LocalDate.now().format(DATE_FORMATTER);
            
            int amount1 = random.nextInt(9000) + 1000;
            int amount2 = random.nextInt(12000) + 3000;
            int amount3 = amount1;
            
            String hash = generateRandomHex(64);
            String imageUrl = "https://a-api.infomedics.nl/TimInvoiceWebApi/api/InvoiceMail/GetImage?Hash=" + 
                            Base64.getEncoder().encodeToString(UUID.randomUUID().toString().getBytes());
            int randomId = random.nextInt(90000000) + 10000000;
            
            sb.append(String.format("%d;TEST_Sample_TC_%d;;;;;%s;%s;;;%s;%s;%s;%d;%s;%s;%s;%s;%d;0;%d;0;%d;%d_P210247%d_%s;;;;%d;%d;4000;%d;;0;12-07-2025;0;0;0;;;;;;;;;;0;0;;0;0;0;;;;;;;;;;;;;;;;;0;;;;;;;;;;;;;;;;;;;;;%d;%d;%d;%d;;%s;%d;;;2;0;;%d;;\n",
                invoiceNr, i, insuredId, patientName, insurer, practiceName, street, houseNr, postcode, city,
                dateFrom.format(DATE_FORMATTER), dateTo, invoiceType, amount1, amount1,
                random.nextInt(9000000) + 1000000, random.nextInt(900) + 100, hash,
                amount2, random.nextInt(96) + 5, amount2,
                amount1, amount1, amount3, amount3, imageUrl, randomId, houseNr));
        }
        
        String practiceName = PRACTICE_NAMES[random.nextInt(PRACTICE_NAMES.length)];
        sb.append(String.format("0;%s;%s;%d;%04dAB;%s;3108000099;Infomedics Marketing;28-11-1983;;;Infomedics Marketing;P.J. Oudweg;41;1314CJ;Almere;%s;10-10-2005;20;0;2570;;2570;;;;;;;;;0;;10-10-2005;;;;;;;;;;;;03006409;;;;;;;;02-11-2005;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;41;;\n",
            practiceName, STREETS[random.nextInt(STREETS.length)], random.nextInt(100) + 1,
            random.nextInt(9000) + 1000, CITIES[random.nextInt(CITIES.length)],
            LocalDate.now().format(DATE_FORMATTER)));
        
        return sb.toString();
    }

    private String generateSpecificatiesFile(String[] insuredIds) {
        StringBuilder sb = new StringBuilder();
        
        for (String insuredId : insuredIds) {
            LocalDate treatmentDate = LocalDate.now().minusDays(random.nextInt(90));
            String amount = TREATMENT_CODES[random.nextInt(TREATMENT_CODES.length)];
            sb.append(String.format("%s;%s;;;%s;;;;;;;;;;%s\n", 
                insuredId, treatmentDate.format(DATE_FORMATTER), amount, amount));
        }
        sb.append("\n");
        
        return sb.toString();
    }

    private long calculateTotalAmount(String debiteurenContent, int invoiceCount) {
        String[] lines = debiteurenContent.split("\n");
        long total = 0;
        
        for (int i = 0; i < invoiceCount && i < lines.length; i++) {
            String[] fields = lines[i].split(";");
            if (fields.length > 20) {
                try {
                    total += Long.parseLong(fields[20]);
                } catch (NumberFormatException e) {
                    log.warn("Failed to parse amount from line {}", i);
                }
            }
        }
        
        return total;
    }

    private String generateRandomHex(int length) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < length; i++) {
            sb.append(String.format("%X", random.nextInt(16)));
        }
        return sb.toString();
    }
}
