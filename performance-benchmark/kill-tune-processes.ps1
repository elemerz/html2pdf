$ErrorActionPreference = "Stop"

Write-Host "Cleaning up tuning-related processes..." -ForegroundColor Cyan

# Patterns that uniquely identify the tuning runs and helper services
$processMatchPatterns = @(
    "target\benchmarks.jar",  # JMH benchmark runs kicked off by tune-* scripts
    "benchmarks.jar",
    "pdf-creator",            # PDF Creator service started during tuning
    "jmh-invoice-bench"       # JMH temp folders sometimes appear in command lines
)

$killedPids = @()

function Stop-JavaProcessByPattern {
    param([string]$Pattern)

    $javaProcs = Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='javaw.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*$Pattern*" }

    foreach ($proc in $javaProcs) {
        if ($killedPids -contains $proc.ProcessId) { continue }

        Write-Host (" - Killing PID {0} (match: {1})" -f $proc.ProcessId, $Pattern)
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
            $killedPids += $proc.ProcessId
        } catch {
            Write-Warning ("   Failed to stop PID {0}: {1}" -f $proc.ProcessId, $_.Exception.Message)
        }
    }
}

# Kill JMH / PDF Creator java processes
foreach ($pattern in $processMatchPatterns) {
    Stop-JavaProcessByPattern -Pattern $pattern
}

# Free the PDF Creator port (6969) if anything is still holding it
$port = 6969
$portOwners = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $portOwners) {
    if (-not $pid) { continue }
    if ($killedPids -contains $pid) { continue }

    Write-Host (" - Killing PID {0} holding port {1}" -f $pid, $port)
    try {
        Stop-Process -Id $pid -Force -ErrorAction Stop
        $killedPids += $pid
    } catch {
        Write-Warning ("   Failed to stop PID {0}: {1}" -f $pid, $_.Exception.Message)
    }
}

# Remove leftover JMH temporary directories to release file locks
try {
    Get-ChildItem -Path $env:TEMP -Filter "jmh-invoice-bench*" -Directory -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
} catch {
    Write-Warning "   Failed to clean JMH temp folders: $($_.Exception.Message)"
}

if ($killedPids.Count -eq 0) {
    Write-Host "No tuning-related processes found." -ForegroundColor Yellow
} else {
    Write-Host ("Stopped {0} process(es)." -f $killedPids.Count) -ForegroundColor Green
}

Write-Host "Cleanup complete. You can re-run the invoicing stack." -ForegroundColor Cyan