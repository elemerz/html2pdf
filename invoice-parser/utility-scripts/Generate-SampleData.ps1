<#
.SYNOPSIS
    Generates sample invoice data folders in ZIP format.

.DESCRIPTION
    Creates sample invoice data in either "classic" format (3 .txt files) or 
    "xml" format (1 .txt + 1 .xml file) and packages them as ZIP files.
    Files are placed directly in the ZIP without subdirectories.

.PARAMETER ModelType
    Type of model to generate: "classic" or "xml"
    - classic: Generates Meta.txt, Debiteuren.txt, and Specificaties.txt
    - xml: Generates Meta.txt and Notas.xml
    Default: "classic"

.PARAMETER SampleCount
    Number of sample ZIP files to generate.
    Default: 1

.EXAMPLE
    .\Generate-SampleData.ps1
    Generates 1 classic sample with default settings

.EXAMPLE
    .\Generate-SampleData.ps1 -ModelType xml -SampleCount 5
    Generates 5 XML model samples

.EXAMPLE
    .\Generate-SampleData.ps1 -SampleCount 10
    Generates 10 classic model samples
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("classic", "xml")]
    [string]$ModelType = "classic",
    
    [Parameter(Mandatory=$false)]
    [ValidateRange(1, 1000)]
    [int]$SampleCount = 100
)

# Sample data templates
#$script:invoiceTypes = @(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 36, 40, 41, 42, 43, 44, 45, 50, 51, 64, 65, 66, 67, 68)
$script:invoiceTypes = @(1, 2, 3, 4, 5, 6, 20, 8, 9, 10, 11, 12, 20, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 20, 28, 29, 30, 32, 33, 34, 36, 40, 41, 42, 20, 44, 45, 50, 51, 64, 65, 66, 20, 68)
$script:insurers = @("Testverzekeraar Noord", "Testverzekeraar Zuid", "Zilveren Kruis Achmea Zorgverzekeringen NV", "CZ groep Zorgverzekeringen")
$script:cities = @("VECOZOTESTCITY", "ALMERE", "EMMELOORD", "DIEMEN", "AMSTERDAM", "UTRECHT")
$script:streets = @("VecozoTestStreet", "Antaresstraat", "Lindelaan", "DIEMERKADE", "P.J. Oudweg")
$script:practiceNames = @("Tandarts Sterrenwijk", "TA_Reserved_1_Pharmaceutical_Compleet", "Huisartsenpraktijk Centrum", "Fysiotherapie Plus")
$script:patientFirstNames = @("GH", "NJ", "M", "B", "D", "P", "J", "K")
$script:patientLastNames = @("Hoeveren-van der Goes", "Albers-De Jong", "Duijkers", "Meerkers", "ARENDS", "FRERIKS", "Jansen", "De Vries")
$script:treatmentCodes = @("2044", "6723", "5507", "1099", "4250", "1506", "3550")
$script:postcodeLetters = @('AA', 'AB', 'AC', 'AD', 'AE', 'BA', 'BB', 'BC', 'BD', 'BE', 'XA', 'XB', 'XC', 'XX', 'ZA', 'ZB', 'ZC', 'ZZ')

function Get-RandomDate {
    param([int]$DaysBack = 120)
    $start = (Get-Date).AddDays(-$DaysBack)
    $randomDays = Get-Random -Minimum 0 -Maximum $DaysBack
    return $start.AddDays($randomDays)
}

function Get-RandomAmount {
    param([int]$Min = 1000, [int]$Max = 15000)
    return (Get-Random -Minimum $Min -Maximum $Max)
}

function Generate-ClassicMetaFile {
    param([string]$FilePath, [int]$InvoiceType, [int]$Count, [decimal]$TotalAmount)
    
    # Define all valid invoice types
    $validTypes = @(1..30) + @(32, 33, 34, 36) + @(40..45) + @(50, 51) + @(64..68)
    
    $content = @()
    foreach ($typeNum in $validTypes) {
        if ($typeNum -eq $InvoiceType) {
            $content += "# type $typeNum : $Count"
        } else {
            $content += "# type $typeNum : 0"
        }
    }
    $content += "# bedrag : $($TotalAmount.ToString("0.00").Replace('.', ','))"
    $content += ""
    
    $content -join "`n" | Out-File -FilePath $FilePath -Encoding UTF8 -NoNewline
}

function Generate-ClassicDebiteurenFile {
    param([string]$FilePath, [int]$Count, [int]$InvoiceType)
    
    $lines = @()
    $totalAmount = 0
    
    for ($i = 0; $i -lt $Count; $i++) {
        $invoiceNr = (Get-Random -Minimum 100000000 -Maximum 999999999)
        $insuredId = "$InvoiceType" + "300148" + (Get-Random -Minimum 300000 -Maximum 999999).ToString().PadLeft(6, '0') + "071"
        $patientName = "$($script:patientFirstNames | Get-Random) $($script:patientLastNames | Get-Random)"
        $insurer = $script:insurers | Get-Random
        $street = $script:streets | Get-Random
        $houseNr = Get-Random -Minimum 1 -Maximum 200
        $postcode = "$(Get-Random -Minimum 1000 -Maximum 9999)$($script:postcodeLetters | Get-Random)"
        $city = $script:cities | Get-Random
        $practiceName = $patientName
        $dateFrom = Get-RandomDate -DaysBack 90
        $dateTo = (Get-Date).ToString("dd-MM-yyyy")
        $amount1 = Get-RandomAmount -Min 1000 -Max 10000
        $amount2 = Get-RandomAmount -Min 3000 -Max 15000
        $amount3 = $amount1
        $totalAmount += $amount1
        $hash = -join ((1..64) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 16) })
        $imageUrl = "https://a-api.infomedics.nl/TimInvoiceWebApi/api/InvoiceMail/GetImage?Hash=$([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(([Guid]::NewGuid()).ToString())))"
        $randomId = Get-Random -Minimum 10000000 -Maximum 99999999
        
        $line = "$invoiceNr;TEST_Sample_TC_$i;;;;;$insuredId;$patientName;;;$insurer;$practiceName;$street;$houseNr;$postcode;$city;$($dateFrom.ToString('dd-MM-yyyy'));$dateTo;$InvoiceType;0;$amount1;0;$amount1;$(Get-Random -Minimum 1000000 -Maximum 9999999)_P210247$(Get-Random -Minimum 100 -Maximum 999)_$hash;;;;$amount2;$(Get-Random -Minimum 5 -Maximum 100);4000;$amount2;;0;12-07-2025;0;0;0;;;;;;;;;;0;0;;0;0;0;;;;;;;;;;;;;;;;;0;;;;;;;;;;;;;;;;;;;;;$amount1;$amount1;$amount3;$amount3;;$imageUrl;$randomId;;;2;0;;$houseNr;;"
        $lines += $line
    }
    
    # Add practitioner line (last line)
    $practiceName = $script:practiceNames | Get-Random
    $practitionerLine = "0;$practiceName;$(($script:streets | Get-Random));$(Get-Random -Minimum 1 -Maximum 100);$(Get-Random -Minimum 1000 -Maximum 9999)AB;$(($script:cities | Get-Random));3108000099;Infomedics Marketing;28-11-1983;;;Infomedics Marketing;P.J. Oudweg;41;1314CJ;Almere;$((Get-Date).ToString('dd-MM-yyyy'));10-10-2005;20;0;2570;;2570;;;;;;;;;0;;10-10-2005;;;;;;;;;;;;03006409;;;;;;;;02-11-2005;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;41;;"
    $lines += $practitionerLine
    
    ($lines -join "`n") + "`n" | Out-File -FilePath $FilePath -Encoding UTF8 -NoNewline
    return $totalAmount
}

function Generate-ClassicSpecificatiesFile {
    param([string]$FilePath, [array]$InsuredIds)
    
    $lines = @()
    foreach ($insuredId in $InsuredIds) {
        $treatmentDate = (Get-RandomDate -DaysBack 90).ToString("dd-MM-yyyy")
        $amount = $script:treatmentCodes | Get-Random
        $line = "$insuredId;$treatmentDate;;;$amount;;;;;;;;;;$amount"
        $lines += $line
    }
    $lines += ""
    
    ($lines -join "`n") | Out-File -FilePath $FilePath -Encoding UTF8 -NoNewline
}

function Generate-XmlMetaFile {
    param([string]$FilePath, [int]$InvoiceType, [int]$Count, [decimal]$TotalAmount)
    
    Generate-ClassicMetaFile -FilePath $FilePath -InvoiceType $InvoiceType -Count $Count -TotalAmount $TotalAmount
}

function Generate-XmlNotasFile {
    param([string]$FilePath, [int]$Count, [int]$InvoiceType)
    
    $totalAmount = 0
    $notasXml = @()
    
    for ($i = 0; $i -lt $Count; $i++) {
        $brutoBedrag = (Get-RandomAmount -Min 3000 -Max 10000) / 100
        $btwPercentage = 9
        $btwBedrag = [Math]::Round($brutoBedrag * $btwPercentage / 109, 2)
        $nettoBedrag = [Math]::Round($brutoBedrag - $btwBedrag, 2)
        $totalAmount += $brutoBedrag
        
        $documentNr = Get-Random -Minimum 1000000 -Maximum 9999999
        $bundleKey = "$(Get-Random -Minimum 1000000 -Maximum 9999999)_$(Get-Random -Minimum 100000 -Maximum 999999)_$(-join ((1..64) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 16) }))"
        $trackingUrl = "https://t-api.infomedics.nl/TimInvoiceWebApi/api/InvoiceMail/GetImage?Hash=$([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(([Guid]::NewGuid()).ToString())))"
        $paymentRef = "0161621$(Get-Random -Minimum 100000 -Maximum 999999)071"
        $dagtekenDate = (Get-Date).ToString("yyyy-MM-dd")
        $betaalDate = (Get-Date).AddDays(30).ToString("yyyy-MM-dd")
        
        $patientName = "$($script:patientFirstNames | Get-Random) $($script:patientLastNames | Get-Random)"
        $debNr = Get-Random -Minimum 1000000 -Maximum 9999999
        $street = $script:streets | Get-Random
        $houseNr = Get-Random -Minimum 1 -Maximum 200
        $postcode = "$(Get-Random -Minimum 1000 -Maximum 9999)$($script:postcodeLetters | Get-Random)"
        $city = $script:cities | Get-Random
        
        $agbCode = "0280$(Get-Random -Minimum 1000 -Maximum 9999)"
        $praktijkCode = "0224$(Get-Random -Minimum 1000 -Maximum 9999)"
        $practiceName = $script:practiceNames | Get-Random
        
        $patientBirthdate = (Get-Date).AddYears(-(Get-Random -Minimum 20 -Maximum 80)).ToString("yyyy-MM-dd")
        $gender = ("M", "V") | Get-Random
        $polisNr = Get-Random -Minimum 100 -Maximum 99999
        $insurer = $script:insurers | Get-Random
        
        $prestatieBedrag1 = [Math]::Round($nettoBedrag * 0.2, 2)
        $prestatieBtw1 = [Math]::Round($prestatieBedrag1 * 0.09, 2)
        $prestatieBedrag2 = [Math]::Round($nettoBedrag * 0.8, 2)
        $prestatieBtw2 = [Math]::Round($prestatieBedrag2 * 0.09, 2)
        
        $notasXml += @"
<Nota Uniek_document_nr="$documentNr" Bundel_in_envelop_sleutel="$bundleKey" Tracking_pixel_URL="$trackingUrl" Betalingskenmerk="$paymentRef" Dagtekening="$dagtekenDate" Uiterste_betaaldatum="$betaalDate" Type_nota="$InvoiceType" Bruto_totaalbedrag="$($brutoBedrag.ToString("0.00"))" BTW_totaalbedrag="$($btwBedrag.ToString("0.00"))" Netto_totaalbedrag="$($nettoBedrag.ToString("0.00"))" Betaald_bedrag="0" Te_betalen_bedrag="$($brutoBedrag.ToString("0.00"))">
  <Debiteur Debiteurnummer="$debNr" Opgemaakte_naam="$patientName" Email_adres="test@infomedics.nl">
    <Adres Straat="$street" Huisnummer="$houseNr" Postcode="$postcode" Plaats="$city" Land="Nederland" />
  </Debiteur>
  <Aanbieder Agb-code_zorgverlener="$agbCode" Praktijk_code="$praktijkCode" Naam="$practiceName" Logo_nr="0">
    <Adres Straat="$street" Huisnummer="$houseNr" Postcode="$postcode" Plaats="$city" Land="Nederland" Telefoonnummer="0031123456" />
  </Aanbieder>
  <Patienten>
    <Patient Opgemaakte_naam="$patientName" Geboortedatum="$patientBirthdate" Geslacht="$gender" Polisnummer="$polisNr" Verzekeraar="$insurer">
      <Prestaties>
        <Prestatie id="${paymentRef}0000" Type="ap" subtype="service" Prestatiecodelijst="060" Machtigingsnummer="" Datum="$dagtekenDate" Prestatiecode="00000000000001" Omschrijving="Terhandstelling" Commentaar="" Aantal_uitgevoerde_prestaties="1" Toelichting_declaratiepost="00" Prestatiekoppelnummer="VOO0528620022$(Get-Random -Minimum 1000 -Maximum 9999)" GVS-bijdrage="0" Bedrag="$($prestatieBedrag1.ToString("0.00"))" Betaald_bedrag="0" BTW_bedrag="$($prestatieBtw1.ToString("0.00"))" BTW_percentage="9">
                  </Prestatie>
        <Prestatie id="${paymentRef}0001" Type="ap" subtype="product" Indicatie_bereiding="N" Prestatiecodelijst="001" Machtigingsnummer="" Voorschrijver="01024522" Instellingscode_voorschrijver="00000000" Datum="$dagtekenDate" Prestatiecode="000000172$(Get-Random -Minimum 10000 -Maximum 99999)" Omschrijving="MEDICIJN TABLET $(Get-Random -Minimum 50 -Maximum 500)MG" Commentaar="" Aantal_uitgevoerde_prestaties="$(Get-Random -Minimum 30 -Maximum 360)" Aflever_eenheid="ST" Toelichting_declaratiepost="00" Prestatiekoppelnummer="VOO0528620022$(Get-Random -Minimum 1000 -Maximum 9999)" GVS-bijdrage="0" Bedrag="$($prestatieBedrag2.ToString("0.00"))" Betaald_bedrag="0" BTW_bedrag="$($prestatieBtw2.ToString("0.00"))" BTW_percentage="9">
                  </Prestatie>
      </Prestaties>
    </Patient>
  </Patienten>
</Nota>
"@
    }
    
    $xmlContent = @"
<?xml version="1.0" encoding="utf-8"?>
<PDP Datum_aanmaak="$(Get-Date -Format "yyyy-MM-ddTHH:mm:ss")" Aantal_notas="$Count">
<Begunstigde Agb-code_servicebureau="01120001" Naam_service_bureau="Infomedics B.V." Begunstigde="NotaCollect" Telefoonnummer="0365472297" E-mail_adres="info@infomedics.nl" Website="www.infomedics.nl" Bankrekening="NL34ABNA0243240058" KVK_Nummer="04048143" Bankrekeninghouder="Infomedics factoring B.V.">
<Adres Straat="Postbus" Huisnummer="60108" Toevoeging="" Postcode="1320AC" Plaats="Almere" Land="Nederland" />
<Notas>
$($notasXml -join "`n")</Notas>
</Begunstigde>
</PDP>
"@
    
    $xmlContent | Out-File -FilePath $FilePath -Encoding UTF8 -NoNewline
    return $totalAmount
}

function Generate-FolderName {
    param([string]$ModelType)
    
    $prefix = if ($ModelType -eq "xml") { "XML_" } else { "" }
    $company = @("InfFactoring", "CMIB", "ACC_InfFactoring", "ACC_CMIB") | Get-Random
    $system = @("TIM", "NOLA", "iDig") | Get-Random
    $date = (Get-Date).ToString("yyyyMMdd")
    $ticks = [DateTime]::UtcNow.Ticks
    
    return "${prefix}${company}_${system}_${date}_${ticks}"
}

# Main script execution
Write-Host "Generating $SampleCount sample(s) of type '$ModelType'..." -ForegroundColor Cyan

$outputDir = Join-Path $PSScriptRoot "_generated"
if (-not (Test-Path $outputDir)) {
    New-Item -Path $outputDir -ItemType Directory | Out-Null
}

for ($s = 1; $s -le $SampleCount; $s++) {
    $folderName = Generate-FolderName -ModelType $ModelType
    $folderPath = Join-Path $outputDir $folderName
    
    Write-Host "[$s/$SampleCount] Creating: $folderName" -ForegroundColor Yellow
    
    New-Item -Path $folderPath -ItemType Directory -Force | Out-Null
    
    $invoiceType = $script:invoiceTypes | Get-Random
    $invoiceCount = Get-Random -Minimum 1 -Maximum 10
    
    if ($ModelType -eq "classic") {
        # Generate classic model files
        $metaFile = Join-Path $folderPath "${folderName}TPG_Meta.txt"
        $debiteurenFile = Join-Path $folderPath "${folderName}TPG_Debiteuren.txt"
        $specificatiesFile = Join-Path $folderPath "${folderName}TPG_Specificaties.txt"
        
        $totalAmount = Generate-ClassicDebiteurenFile -FilePath $debiteurenFile -Count $invoiceCount -InvoiceType $invoiceType
        
        # Extract insured IDs for specificaties
        $debiteurenContent = Get-Content $debiteurenFile
        $insuredIds = @()
        for ($i = 0; $i -lt ($debiteurenContent.Count - 1); $i++) {
            $fields = $debiteurenContent[$i] -split ";"
            if ($fields.Count -gt 6) {
                $insuredIds += $fields[6]
            }
        }
        
        Generate-ClassicSpecificatiesFile -FilePath $specificatiesFile -InsuredIds $insuredIds
        Generate-ClassicMetaFile -FilePath $metaFile -InvoiceType $invoiceType -Count $invoiceCount -TotalAmount ($totalAmount / 100)
        
    } else {
        # Generate XML model files
        $metaFile = Join-Path $folderPath "${folderName}TPG_Meta.txt"
        $notasFile = Join-Path $folderPath "${folderName}TPG_Notas.xml"
        
        $totalAmount = Generate-XmlNotasFile -FilePath $notasFile -Count $invoiceCount -InvoiceType $invoiceType
        Generate-XmlMetaFile -FilePath $metaFile -InvoiceType $invoiceType -Count $invoiceCount -TotalAmount $totalAmount
    }
    
    # Create zip file with files directly at root (no subdirectory)
    $zipFile = Join-Path $outputDir "$folderName.zip"
    $filesToZip = Get-ChildItem -Path $folderPath -File
    
    # Add files to zip at root level
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($zipFile, 'Create')
    foreach ($file in $filesToZip) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $file.Name, 'Optimal') | Out-Null
    }
    $zip.Dispose()
    
    # Remove the folder after zipping
    Remove-Item -Path $folderPath -Recurse -Force
    
    Write-Host "  Created: $zipFile" -ForegroundColor Green
}

Write-Host "`nCompleted! Generated $SampleCount sample zip file(s) in: $outputDir" -ForegroundColor Cyan
