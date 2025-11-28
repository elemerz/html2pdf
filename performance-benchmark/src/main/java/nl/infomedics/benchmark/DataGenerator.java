package nl.infomedics.benchmark;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public class DataGenerator {
    private static final Random RANDOM = new Random();
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd-MM-yyyy");
    
    private static final int[] INVOICE_TYPES = {1, 2, 3, 4, 5, 6, 20, 8, 9, 10, 11, 12, 20, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 20, 28, 29, 30, 32, 33, 34, 36, 40, 41, 42, 20, 44, 45, 50, 51, 64, 65, 66, 20, 68};
    private static final String[] INSURERS = {"Testverzekeraar Noord", "Testverzekeraar Zuid", "Zilveren Kruis Achmea Zorgverzekeringen NV", "CZ groep Zorgverzekeringen"};
    private static final String[] CITIES = {"VECOZOTESTCITY", "ALMERE", "EMMELOORD", "DIEMEN", "AMSTERDAM", "UTRECHT"};
    private static final String[] STREETS = {"VecozoTestStreet", "Antaresstraat", "Lindelaan", "DIEMERKADE", "P.J. Oudweg"};
    private static final String[] PRACTICE_NAMES = {"Tandarts Sterrenwijk", "TA_Reserved_1_Pharmaceutical_Compleet", "Huisartsenpraktijk Centrum", "Fysiotherapie Plus"};
    private static final String[] FIRST_NAMES = {"GH", "NJ", "M", "B", "D", "P", "J", "K"};
    private static final String[] LAST_NAMES = {"Hoeveren-van der Goes", "Albers-De Jong", "Duijkers", "Meerkers", "ARENDS", "FRERIKS", "Jansen", "De Vries"};
    private static final String[] TREATMENT_CODES = {"2044", "6723", "5507", "1099", "4250", "1506", "3550"};
    private static final String[] POSTCODE_LETTERS = {"AA", "AB", "AC", "AD", "AE", "BA", "BB", "BC", "BD", "BE", "XA", "XB", "XC", "XX", "ZA", "ZB", "ZC", "ZZ"};

    public static void generateClassicZip(Path zipPath) throws IOException {
        String folderName = zipPath.getFileName().toString().replace(".zip", "");
        int invoiceType = INVOICE_TYPES[RANDOM.nextInt(INVOICE_TYPES.length)];
        int invoiceCount = 1 + RANDOM.nextInt(10);
        
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipPath))) {
            // Generate Debiteuren content
            StringBuilder debiContent = new StringBuilder();
            List<String> insuredIds = new ArrayList<>();
            double totalAmount = 0;
            
            for (int i = 0; i < invoiceCount; i++) {
                long invoiceNr = 100000000L + RANDOM.nextInt(900000000);
                String insuredId = invoiceType + "300148" + String.format("%06d", 300000 + RANDOM.nextInt(700000)) + "071";
                insuredIds.add(insuredId);
                
                String patientName = getRandom(FIRST_NAMES) + " " + getRandom(LAST_NAMES);
                String insurer = getRandom(INSURERS);
                String street = getRandom(STREETS);
                int houseNr = 1 + RANDOM.nextInt(200);
                String postcode = (1000 + RANDOM.nextInt(9000)) + getRandom(POSTCODE_LETTERS);
                String city = getRandom(CITIES);
                String dateFrom = LocalDate.now().minusDays(RANDOM.nextInt(120)).format(DATE_FMT);
                String dateTo = LocalDate.now().format(DATE_FMT);
                
                int amount1 = 1000 + RANDOM.nextInt(9000);
                int amount2 = 3000 + RANDOM.nextInt(12000);
                totalAmount += amount1;
                
                String hash = UUID.randomUUID().toString().replace("-", "");
                String imageUrl = "https://a-api.infomedics.nl/TimInvoiceWebApi/api/InvoiceMail/GetImage?Hash=" + hash;
                
                debiContent.append(String.format("%d;TEST_Sample_TC_%d;;;;;%s;%s;;;%s;%s;%s;%d;%s;%s;%s;%s;%d;0;%d;0;%d;REF_%s;;;;%d;%d;4000;%d;;0;12-07-2025;0;0;0;;;;;;;;;;0;0;;0;0;0;;;;;;;;;;;;;;;;;0;;;;;;;;;;;;;;;;;;;;;%d;%d;%d;%d;;%s;%d;;;2;0;;%d;;\n",
                    invoiceNr, i, insuredId, patientName, insurer, patientName, street, houseNr, postcode, city, dateFrom, dateTo, invoiceType,
                    amount1, amount1, hash, amount2, 5 + RANDOM.nextInt(95), amount2, amount1, amount1, amount1, amount1, imageUrl, 10000000 + RANDOM.nextInt(90000000), houseNr));
            }
            
            // Practitioner line
            String practiceName = getRandom(PRACTICE_NAMES);
            debiContent.append(String.format("0;%s;%s;%d;%s;%s;3108000099;Infomedics Marketing;28-11-1983;;;Infomedics Marketing;P.J. Oudweg;41;1314CJ;Almere;%s;10-10-2005;20;0;2570;;2570;;;;;;;;;0;;10-10-2005;;;;;;;;;;;;03006409;;;;;;;;02-11-2005;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;41;;\n",
                practiceName, getRandom(STREETS), 1 + RANDOM.nextInt(100), (1000 + RANDOM.nextInt(9000)) + "AB", getRandom(CITIES), LocalDate.now().format(DATE_FMT)));
            
            addZipEntry(zos, folderName + "TPG_Debiteuren.txt", debiContent.toString());
            
            // Generate Specificaties content
            StringBuilder specContent = new StringBuilder();
            for (String id : insuredIds) {
                String date = LocalDate.now().minusDays(RANDOM.nextInt(90)).format(DATE_FMT);
                String amount = getRandom(TREATMENT_CODES);
                specContent.append(String.format("%s;%s;;;%s;;;;;;;;;;%s\n", id, date, amount, amount));
            }
            addZipEntry(zos, folderName + "TPG_Specificaties.txt", specContent.toString());
            
            // Generate Meta content
            StringBuilder metaContent = new StringBuilder();
            for (int type : INVOICE_TYPES) { // Simplified: iterating over array, duplicates don't matter much for format
                 // Ideally we should deduplicate types for the meta file structure if strict, 
                 // but the parser likely looks for the specific line.
                 // Let's just write the active one correctly.
            }
            // A cleaner approach for Meta file based on PS script logic:
            // It iterates 1..68 (with gaps) and writes 0 or count.
            for (int t = 1; t <= 68; t++) {
                if (t == invoiceType) {
                    metaContent.append("# type ").append(t).append(" : ").append(invoiceCount).append("\n");
                } else {
                    // Only write lines for valid types if we want to be exact, but 0 is safe
                    // The PS script has a specific list of valid types.
                    // We will just write the active one and a few others to mimic it or just the active one.
                    // To be safe and simple:
                    if (isValidType(t)) {
                         metaContent.append("# type ").append(t).append(" : 0\n");
                    }
                }
            }
            metaContent.append("# bedrag : ").append(String.format("%.2f", totalAmount / 100.0).replace('.', ',')).append("\n");
            addZipEntry(zos, folderName + "TPG_Meta.txt", metaContent.toString());
        }
    }
    
    private static boolean isValidType(int t) {
        for (int type : INVOICE_TYPES) {
            if (type == t) return true;
        }
        return false;
    }

    private static void addZipEntry(ZipOutputStream zos, String name, String content) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        zos.putNextEntry(entry);
        zos.write(content.getBytes(StandardCharsets.UTF_8));
        zos.closeEntry();
    }
    
    private static <T> T getRandom(T[] array) {
        return array[RANDOM.nextInt(array.length)];
    }
}
