# Nirmala Matha Central School - Publish to Public Internet
# Generates an instant, secure, public HTTPS link using Cloudflare Tunnel

param(
    [int]$Port = 8080
)

$Host.UI.RawUI.WindowTitle = "NMCS IT Complaint Register - Public Cloudflare Tunnel"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "       NIRMALA MATHA CENTRAL SCHOOL - PUBLISH TO INTERNET        " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $ScriptDir) {
    $ScriptDir = Get-Location
}

# 1. Check if local server is already running on port
$serverRunning = $false
try {
    $test = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    $serverRunning = $true
    Write-Host "[OK] Local web server already active on port $Port." -ForegroundColor Green
} catch {
    Write-Host "[*] Starting local web server on port $Port..." -ForegroundColor Gray
    $serverProcess = Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptDir\Start-Server.ps1`" -Port $Port -NoBrowser" -PassThru
    Start-Sleep -Seconds 2
}

# 2. Check for cloudflared executable
$cfExe = Join-Path $ScriptDir "cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    Write-Host "[Error] cloudflared.exe not found in $ScriptDir" -ForegroundColor Red
    exit 1
}

Write-Host "[*] Creating secure public HTTPS tunnel via Cloudflare..." -ForegroundColor Cyan
Write-Host "    (No account or sign-in required. 100% Free & Secure)" -ForegroundColor DarkGray
Write-Host ""

$logFile = Join-Path $ScriptDir "tunnel.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

# Start cloudflared process redirecting output to logFile
$cfProc = Start-Process -FilePath $cfExe -ArgumentList "tunnel --protocol http2 --url http://127.0.0.1:$Port --http-host-header 127.0.0.1:$Port" -RedirectStandardError $logFile -PassThru

$publicUrl = $null
$timeout = 25
$elapsed = 0

Write-Host "Waiting for tunnel connection to establish..." -NoNewline

while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed++
    Write-Host "." -NoNewline

    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
        if ($content -match "https://[a-zA-Z0-9-]+\.trycloudflare\.com") {
            $publicUrl = $matches[0]
            break
        }
    }
}
Write-Host ""

if ($publicUrl) {
    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host "          SUCCESS! YOUR SITE IS NOW PUBLISHED ONLINE!            " -ForegroundColor Yellow
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Public Live URL: " -NoNewline -ForegroundColor White
    Write-Host "$publicUrl" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  -> Accessible worldwide on any phone, tablet, laptop, or PC!" -ForegroundColor Gray
    Write-Host "  -> Fully secured with Cloudflare HTTPS SSL encryption." -ForegroundColor Gray
    Write-Host ""
    Write-Host "Opening public URL in your default browser..." -ForegroundColor DarkYellow
    Start-Process $publicUrl
    Write-Host ""
    Write-Host "Keep this window open to maintain the online link." -ForegroundColor Magenta
    Write-Host "Press Ctrl+C to close and unpublish." -ForegroundColor DarkGray
    Write-Host "==================================================================" -ForegroundColor Green

    # Wait until user terminates or process stops
    try {
        $cfProc.WaitForExit()
    } finally {
        if (-not $cfProc.HasExited) {
            Stop-Process -Id $cfProc.Id -Force -ErrorAction SilentlyContinue
        }
        if ($serverProcess -and -not $serverProcess.HasExited) {
            Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host ""
    Write-Host "[!] Could not automatically capture the public URL within $timeout seconds." -ForegroundColor Red
    Write-Host "Check tunnel.log for details." -ForegroundColor Yellow
    if (Test-Path $logFile) {
        Get-Content $logFile -Tail 20
    }
}
