# Create 0-byte presence marker .txt files for all .zip and .html files
# in the directory where this script is located

# Get the directory where the script is located
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Get all .zip and .html files in the script directory
$files = Get-ChildItem -Path $scriptDir -File | Where-Object { $_.Extension -eq '.zip' -or $_.Extension -eq '.html' }

foreach ($file in $files) {
    # Create the marker filename by replacing the extension with .txt
    $markerName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) + '.txt'
    $markerPath = Join-Path -Path $scriptDir -ChildPath $markerName
    
    # Create 0-byte file if it doesn't exist, or update timestamp if it does
    New-Item -Path $markerPath -ItemType File -Force | Out-Null
    
    Write-Host "Created marker: $markerName"
}

Write-Host "`nDone! Created $($files.Count) presence marker files."
