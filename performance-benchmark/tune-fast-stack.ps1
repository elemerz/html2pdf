$ErrorActionPreference = "Stop"

# Configuration
$jarPath = Join-Path $PSScriptRoot "target/benchmarks.jar"
$pdfCreatorDir = Join-Path $PSScriptRoot "..\pdf-creator"
$startScript = ".\start.bat"
$logFile = Join-Path $PSScriptRoot "pdf-creator-startup.log"
$benchmarkResultFile = Join-Path $PSScriptRoot "fast-benchmark-result.json"

# Initial Search Range (Powers of 2)
$initialValues = @(8, 16, 32, 64, 128)

$globalBestScore = 0
$globalBestConfig = @{ S = 0; Z = 0; P = 0 }

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
    $retries = 60
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
        } catch { }
        Start-Sleep -Seconds 1
        $retries--
    }
    return $false
}

function Start-PdfCreator {
    param($concurrency)
    Stop-PdfCreator
    
    $arg = "--converter.max-concurrent=$concurrency"
    Write-Host "Starting PDF Creator with concurrency $concurrency..."
    
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $startScript $arg > `"$logFile`" 2>&1" -WorkingDirectory $pdfCreatorDir -WindowStyle Minimized
    
    if (-not (Wait-For-PdfCreator)) {
        Write-Error "PDF Creator failed to start! Check $logFile."
    }
    Write-Host "PDF Creator is UP." -ForegroundColor Green
}

function Run-Benchmark {
    param($z, $p)
    
    Write-Host "  Running Benchmark: ZipWorkers=$z, PdfConversions=$p" -NoNewline
    
    # Clean previous result
    if (Test-Path $benchmarkResultFile) { Remove-Item $benchmarkResultFile }
    
    # Run JMH
    # We use -jvmArgs to pass the Spring Boot properties
    # -rf json -rff ... to output JSON
    $jvmArgs = "-Dzip.concurrent-workers=$z -Dpdf.max-concurrent-conversions=$p -Dxhtml2pdf.base-url=https://localhost:6969 -Dxhtml2pdf.ssl.trust-store=..\keystore\infomedics-trust.p12 -Dxhtml2pdf.ssl.trust-store-password=changeit -Djavax.net.ssl.trustStore=..\keystore\infomedics-trust.p12 -Djavax.net.ssl.trustStoreType=PKCS12 -Djavax.net.ssl.trustStorePassword=changeit"
    $cmdArgs = "-jar `"$jarPath`" FastInvoiceBenchmark -p fileCount=100 -p invoiceTypes=`"20`" -jvmArgs `"$jvmArgs`" -rf json -rff `"$benchmarkResultFile`""
    
    # Run synchronously
    $proc = Start-Process -FilePath "java" -ArgumentList $cmdArgs -Wait -NoNewWindow -PassThru
    
    if ($proc.ExitCode -ne 0) {
        Write-Host " [FAILED]" -ForegroundColor Red
        return 0
    }
    
    if (Test-Path $benchmarkResultFile) {
        try {
            $json = Get-Content $benchmarkResultFile | ConvertFrom-Json
            # JMH JSON output is an array of results. We expect one result here.
            $score = $json[0].primaryMetric.score
            Write-Host " -> Score: $score ops/s" -ForegroundColor Yellow
            return $score
        } catch {
            Write-Host " [ERROR PARSING]" -ForegroundColor Red
            return 0
        }
    } else {
        Write-Host " [NO OUTPUT]" -ForegroundColor Red
        return 0
    }
}

# --- Main Logic ---

Write-Host "Starting Fast Stack Tuning..." -ForegroundColor Cyan

# Phase 1: Coarse Sweep (Powers of 2)
# We iterate S, then Z, then P.
# We stop increasing if performance drops significantly (e.g. < 90% of previous best in the sequence).

$bestS = 8
$bestZ = 8
$bestP = 8

# Iterate Server Concurrency
foreach ($s in $initialValues) {
    Start-PdfCreator -concurrency $s
    
    $bestScoreForS = 0
    
    # Iterate Zip Workers
    foreach ($z in $initialValues) {
        
        # Pruning: If Z is much larger than S, it might not be useful, but let's test until drop.
        
        $bestScoreForZ = 0
        
        # Iterate PDF Conversions
        foreach ($p in $initialValues) {
            # Pruning: PDF Conversions shouldn't exceed Server Concurrency significantly, 
            # but let's allow it to see the drop.
            
            $score = Run-Benchmark -z $z -p $p
            
            if ($score -gt $globalBestScore) {
                $globalBestScore = $score
                $globalBestConfig = @{ S = $s; Z = $z; P = $p }
                $bestS = $s
                $bestZ = $z
                $bestP = $p
            }
            
            if ($score -gt $bestScoreForZ) {
                $bestScoreForZ = $score
            } elseif ($score -lt ($bestScoreForZ * 0.8)) {
                # Performance dropped by 20%, stop increasing P
                Write-Host "    (Performance dropped for P, breaking inner loop)" -ForegroundColor Gray
                break
            }
        }
        
        if ($bestScoreForZ -gt $bestScoreForS) {
            $bestScoreForS = $bestScoreForZ
        } elseif ($bestScoreForZ -lt ($bestScoreForS * 0.8)) {
             # Performance dropped by 20%, stop increasing Z
             Write-Host "  (Performance dropped for Z, breaking middle loop)" -ForegroundColor Gray
             break
        }
    }
    
    # Check if increasing S is helping
    # We need to compare bestScoreForS with the best score of the previous S
    # But since we track global best, we can just check if we found a new global best in this S iteration.
    # If the best score for this S is significantly lower than global best (found in previous S), maybe stop?
    if ($bestScoreForS -lt ($globalBestScore * 0.8)) {
        Write-Host "(Performance dropped for S, breaking outer loop)" -ForegroundColor Gray
        break
    }
}

Write-Host "`nPhase 1 Complete. Best: S=$bestS, Z=$bestZ, P=$bestP (Score: $globalBestScore)" -ForegroundColor Cyan

# Phase 2: Fine Tuning (In-between values)
# Try midpoints around the best values.
# e.g. if Best is 32, try 24 and 48.
# We will try to refine each parameter independently starting from the best config.

$refineParams = @("S", "Z", "P")

foreach ($param in $refineParams) {
    $currentVal = $globalBestConfig[$param]
    $lower = [int]($currentVal * 0.75)
    $upper = [int]($currentVal * 1.5)
    
    $candidates = @()
    if ($lower -ne $currentVal -and $lower -gt 0) { $candidates += $lower }
    if ($upper -ne $currentVal) { $candidates += $upper }
    
    foreach ($val in $candidates) {
        # Construct config
        $testS = if ($param -eq "S") { $val } else { $globalBestConfig.S }
        $testZ = if ($param -eq "Z") { $val } else { $globalBestConfig.Z }
        $testP = if ($param -eq "P") { $val } else { $globalBestConfig.P }
        
        Write-Host "Fine Tuning ${param}: Testing $val..."
        
        # Only restart server if S changed
        if ($param -eq "S") {
            Start-PdfCreator -concurrency $testS
        } elseif ($param -eq "Z" -and $refineParams[0] -eq "S") {
             # Ensure server is running with best S (or current S)
             # If we just finished tuning S, the server is running with testS.
             # If we are tuning Z, we need server at globalBestConfig.S
             # Let's just restart to be safe and simple, or check.
             Start-PdfCreator -concurrency $testS
        } else {
             # If we are tuning P, server should be at testS (which is globalBestConfig.S)
             # Optimization: check if running? No, just restart to be safe or assume it's running from previous step.
             # Actually, if we iterate S, then Z, then P, we might leave the server in a state.
             Start-PdfCreator -concurrency $testS
        }
        
        $score = Run-Benchmark -z $testZ -p $testP
        
        if ($score -gt $globalBestScore) {
            Write-Host "  New Best Found!" -ForegroundColor Green
            $globalBestScore = $score
            $globalBestConfig = @{ S = $testS; Z = $testZ; P = $testP }
        }
    }
}

Stop-PdfCreator

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "TUNING COMPLETE" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Max Performance Configuration:"
Write-Host "  Throughput:          $globalBestScore ops/s"
Write-Host "  PDF Server Threads:  $($globalBestConfig.S)"
Write-Host "  Zip Client Workers:  $($globalBestConfig.Z)"
Write-Host "  PDF Client Limit:    $($globalBestConfig.P)"
Write-Host "Recommended settings:"
Write-Host "  - invoice-parser:zip.concurrent-workers=$($globalBestConfig.Z)"
Write-Host "  - invoice-parser:pdf.max-concurrent-conversions=$($globalBestConfig.P)"
Write-Host "  - pdf-creator:converter.max-concurrent=$($globalBestConfig.S)"
Write-Host "========================================================"
