$pdfConcurrencyLevels = @(8, 16, 32)
$bestGlobalScore = 0
$bestGlobalConfig = @{}
$results = @()

function Stop-PdfCreator {
    $port = 6969
    $tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($tcp) {
        Write-Host "Stopping PDF Creator on PID $($tcp.OwningProcess)..."
        Stop-Process -Id $tcp.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

function Wait-For-PdfCreator {
    $retries = 120
    $port = 6969
    while ($retries -gt 0) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $connect = $tcp.BeginConnect("localhost", $port, $null, $null)
            $wait = $connect.AsyncWaitHandle.WaitOne(1000, $false)
            if ($wait) {
                $tcp.EndConnect($connect)
                $tcp.Close()
                return $true
            }
            $tcp.Close()
        } catch {
             # Ignore errors, just retry
        }
        Start-Sleep -Seconds 1
        $retries--
    }
    return $false
}

# Ensure we are in the right directory
Set-Location $PSScriptRoot

foreach ($pdfLevel in $pdfConcurrencyLevels) {
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host "Testing PDF Creator Concurrency: $pdfLevel" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan

    Stop-PdfCreator
    
    # Start PDF Creator with the specific concurrency level
    $pdfCreatorDir = Join-Path $PSScriptRoot "..\pdf-creator"
    $startScript = ".\start.bat"
    $arg = "--converter.max-concurrent=$pdfLevel"
    Write-Host "Starting PDF Creator: $startScript $arg (in $pdfCreatorDir)"
    
    # Start in a new window so it persists, ensuring correct WorkingDirectory
    # Redirect output to a log file for debugging
    $logFile = Join-Path $PSScriptRoot "pdf-creator-startup.log"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $startScript $arg > `"$logFile`" 2>&1" -WorkingDirectory $pdfCreatorDir -WindowStyle Minimized
    
    Write-Host "Waiting for PDF Creator to initialize..."
    if (-not (Wait-For-PdfCreator)) {
        Write-Error "PDF Creator failed to start! Check $logFile for details."
        Get-Content $logFile -Tail 20 | Write-Host -ForegroundColor Red
        continue
    }
    Write-Host "PDF Creator is UP." -ForegroundColor Green

    # Run the client-side tuning
    Write-Host "Running benchmark sweep..."
    # We call the existing batch file but suppress its pause/cleanup if possible, 
    # or just let it run. It produces tuning-results.json.
    $tuneScript = ".\tune-system.bat"
    # We need to run it and wait.
    # Use NoNewWindow to show output in the current console
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $tuneScript" -Wait -NoNewWindow

    # Analyze results
    if (Test-Path "tuning-results.json") {
        $json = Get-Content "tuning-results.json" | ConvertFrom-Json
        # Find best in this batch
        $bestInBatch = $json | Sort-Object -Property @{Expression={$_.primaryMetric.score}} -Descending | Select-Object -First 1
        
        $score = $bestInBatch.primaryMetric.score
        $zipWorkers = $bestInBatch.params.zipConcurrentWorkers
        $pdfConversions = $bestInBatch.params.pdfMaxConcurrentConversions
        
        Write-Host "Batch Best: $score ops/s (Zip=$zipWorkers, ClientPDF=$pdfConversions)" -ForegroundColor Yellow
        
        $resultObj = @{
            ServerConcurrency = $pdfLevel
            ClientZipWorkers = $zipWorkers
            ClientPdfConversions = $pdfConversions
            Score = $score
        }
        $results += $resultObj
        
        if ($score -gt $bestGlobalScore) {
            $bestGlobalScore = $score
            $bestGlobalConfig = $resultObj
        }
    } else {
        Write-Error "No tuning results found for this iteration."
    }
}

Stop-PdfCreator

Write-Host "`n`n********************************************************" -ForegroundColor Green
Write-Host "FULL STACK TUNING COMPLETE" -ForegroundColor Green
Write-Host "********************************************************" -ForegroundColor Green
Write-Host "Global Best Configuration:"
Write-Host "  Throughput:          $($bestGlobalConfig.Score) ops/s"
Write-Host "  PDF Server Threads:  $($bestGlobalConfig.ServerConcurrency)"
Write-Host "  Zip Client Workers:  $($bestGlobalConfig.ClientZipWorkers)"
Write-Host "  PDF Client Limit:    $($bestGlobalConfig.ClientPdfConversions)"
Write-Host "********************************************************"

# Output all results
$results | Format-Table -AutoSize