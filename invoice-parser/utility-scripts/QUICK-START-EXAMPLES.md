# Quick Start Examples

## Windows PowerShell

Open PowerShell in the invoice-parser directory and run:

### Generate 5 classic model samples
```powershell
.\Generate-SampleData.ps1 -ModelType classic -SampleCount 5
```

### Generate 3 XML model samples
```powershell
.\Generate-SampleData.ps1 -ModelType xml -SampleCount 3
```

### Generate 1 sample of each type
```powershell
# Classic
.\Generate-SampleData.ps1 -ModelType classic -SampleCount 1

# XML
.\Generate-SampleData.ps1 -ModelType xml -SampleCount 1
```

## What Gets Generated

### Classic Model Sample
Each ZIP file contains:
```
ACC_InfFactoring_TIM_20250922_638941329761122422/
├── ACC_InfFactoring_TIM_20250922_638941329761122422TPG_Meta.txt
├── ACC_InfFactoring_TIM_20250922_638941329761122422TPG_Debiteuren.txt
└── ACC_InfFactoring_TIM_20250922_638941329761122422TPG_Specificaties.txt
```

### XML Model Sample
Each ZIP file contains:
```
XML_InfFactoring_iDig_20250923_638942442644929181/
├── XML_InfFactoring_iDig_20250923_638942442644929181TPG_Meta.txt
└── XML_InfFactoring_iDig_20250923_638942442644929181TPG_Notas.xml
```

## Output Location

All generated ZIP files are placed in:
```
invoice-parser/samples/
```

## Verification

After running the script, verify your samples:

```powershell
# List generated samples
Get-ChildItem .\samples\*.zip

# View details
Get-ChildItem .\samples\*.zip | Format-Table Name, Length, LastWriteTime

# Extract a sample to inspect
Expand-Archive -Path .\samples\<sample-name>.zip -DestinationPath .\temp-inspect
```

## Tips

1. **Batch Generation**: Generate multiple types at once
   ```powershell
   .\Generate-SampleData.ps1 -ModelType classic -SampleCount 10
   .\Generate-SampleData.ps1 -ModelType xml -SampleCount 5
   ```

2. **Clean Old Samples**: Before generating new test data
   ```powershell
   Remove-Item .\samples\*.zip
   ```

3. **View Generated Content**: Extract and inspect
   ```powershell
   $zipFile = Get-ChildItem .\samples\*.zip | Select-Object -First 1
   Expand-Archive -Path $zipFile.FullName -DestinationPath .\inspect -Force
   Get-ChildItem .\inspect -Recurse | Select-Object Name, Length
   ```

## Script Parameters

- **ModelType**: `classic` or `xml` (case-sensitive)
- **SampleCount**: Integer (1-100 recommended)

Both parameters are mandatory.
