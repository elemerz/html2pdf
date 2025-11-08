# Sample Data Generator

This PowerShell script generates sample invoice data folders in the format used by the invoice-parser system.

## Overview

The script can generate two types of sample data models:

### Classic Model
Contains 3 files:
- `*_Meta.txt`: Metadata specifying invoice types and counts
- `*_Debiteuren.txt`: Semicolon-separated debtor information (patients) and practitioner info in the last line
- `*_Specificaties.txt`: Treatment/service specifications

### XML Model
Contains 2 files:
- `*_Meta.txt`: Metadata specifying invoice types and counts
- `*_Notas.xml`: XML file with merged invoice (notas), practitioner (Aanbieder), patient (Patienten), and treatment (Prestatie) data

## Usage

```powershell
.\Generate-SampleData.ps1 [-ModelType <classic|xml>] [-SampleCount <number>]
```

### Parameters

- **ModelType** (Optional): Type of model to generate
  - `classic`: Generates 3 .txt files per sample (default)
  - `xml`: Generates 1 .txt + 1 .xml file per sample
  - Default: `classic`
  
- **SampleCount** (Optional): Number of sample zip files to generate
  - Default: `1`
  - Range: 1-100

### Examples

Run with defaults (generates 1 classic sample):
```powershell
.\Generate-SampleData.ps1
```

Generate 5 classic model samples:
```powershell
.\Generate-SampleData.ps1 -ModelType classic -SampleCount 5
```

Generate 3 XML model samples:
```powershell
.\Generate-SampleData.ps1 -ModelType xml -SampleCount 3
```

Generate a single classic sample (using default ModelType):
```powershell
.\Generate-SampleData.ps1 -SampleCount 1
```

Get help:
```powershell
Get-Help .\Generate-SampleData.ps1 -Detailed
```

## Output

The script creates a `samples_generated` folder (if it doesn't exist) in the same directory as the script and generates:
- Compressed ZIP files containing the data files directly at root level (no subdirectories)
- Folder naming convention: `[XML_]<Company>_<System>_<Date>_<Ticks>`

Examples:
- Classic: `ACC_InfFactoring_TIM_20250922_638941329761122422.zip`
- XML: `XML_InfFactoring_iDig_20250923_638942442644929181.zip`

**Note**: Files are placed directly in the ZIP file without a subfolder structure.

## Data Structure

### Meta.txt Format
```
# type 1 : 0
# type 2 : 0
...
# type 27 : 6
...
# bedrag : 541,32
```

### Debiteuren.txt Format (Classic)
Semicolon-separated fields including:
- Invoice number
- Patient name
- Insured ID
- Insurer
- Address details
- Dates
- Invoice type
- Amounts
- Image URLs
- Last line: Practitioner information

### Specificaties.txt Format (Classic)
Semicolon-separated treatment records:
- Insured ID (join key)
- Treatment date
- Treatment codes
- Amounts

### Notas.xml Format (XML)
Structured XML with:
- PDP root element with metadata
- Begunstigde (beneficiary) information
- Notas (invoices) containing:
  - Debiteur (debtor/patient)
  - Aanbieder (provider/practitioner)
  - Patienten (patients) with Prestaties (treatments/services)

## Features

- Randomized realistic test data
- Multiple insurance companies
- Various invoice types (1-68)
- Random amounts, dates, and addresses
- Automatic ZIP file creation
- Clean folder structure

## Data Model References

See Java model classes in:
- `src/main/java/nl/infomedics/invoicing/model/Debiteur.java`
- `src/main/java/nl/infomedics/invoicing/model/MetaInfo.java`
- `src/main/java/nl/infomedics/invoicing/model/Specificatie.java`
- `src/main/java/nl/infomedics/invoicing/model/Practitioner.java`
- `src/main/java/nl/infomedics/invoicing/model/InvoiceBundle.java`

## Notes

- **Parameters are optional** - Run without parameters to generate 1 classic sample
- Generated data is randomized for testing purposes
- Invoice types are selected from predefined list
- Amounts are in cents in the data files
- All ZIP files are created in the `samples_generated` subdirectory
- Files are placed directly in ZIP (no subfolder structure)
- Original folders are removed after ZIP creation to save space
