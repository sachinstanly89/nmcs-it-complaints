# Nirmala Matha Central School - IT Complaint Register
# Local LAN & Desktop Web Server using native Windows PowerShell & .NET

param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

try {
    $Host.UI.RawUI.WindowTitle = "NMCS IT Complaint Register - Web Server"
} catch {
    # Headless or background job safe
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "       NIRMALA MATHA CENTRAL SCHOOL - IT COMPLAINT REGISTER       " -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $ScriptDir) {
    $ScriptDir = Get-Location
}

# Determine local IP addresses for sharing across the school network
$LocalIPs = @()
try {
    $LocalIPs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | 
        Select-Object -ExpandProperty IPAddress
} catch {}

Write-Host "Serving files from: $ScriptDir" -ForegroundColor Gray
Write-Host ""
Write-Host "[Local Access]" -ForegroundColor Green
Write-Host "  -> http://localhost:$Port/" -ForegroundColor White
Write-Host ""

if ($LocalIPs) {
    Write-Host "[School Wi-Fi / LAN Access for Teachers & Staff]" -ForegroundColor Green
    foreach ($ip in $LocalIPs) {
        Write-Host "  -> http://$ip`:$Port/" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Share the link above with teachers so they can register complaints from any classroom IFP or phone!" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "Press Ctrl+C at any time in this window to stop the server." -ForegroundColor Magenta
Write-Host "------------------------------------------------------------------" -ForegroundColor DarkCyan

# Create HttpListener
$Listener = New-Object System.Net.HttpListener

# Try listening on all interfaces, fall back to localhost if elevation required
$PrefixAll = "http://*:$Port/"
$PrefixLocal = "http://localhost:$Port/"

try {
    $Listener.Prefixes.Add($PrefixAll)
    $Listener.Start()
    Write-Host "Listener started on all interfaces (Port $Port)" -ForegroundColor Green
} catch {
    $Listener = New-Object System.Net.HttpListener
    $Listener.Prefixes.Add("http://localhost:$Port/")
    try { $Listener.Prefixes.Add("http://127.0.0.1:$Port/") } catch {}
    $Listener.Start()
    Write-Host "(Running in user mode: listening on localhost & 127.0.0.1 on Port $Port)" -ForegroundColor DarkYellow
}

# Launch default browser unless suppressed
if (-not $NoBrowser) {
    try {
        Start-Process "http://localhost:$Port/"
    } catch {}
}

# Central Server Database Setup
$DataDir = Join-Path $ScriptDir "data"
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}
$TicketsFile = Join-Path $DataDir "tickets.json"
if (-not (Test-Path $TicketsFile)) {
    Set-Content -Path $TicketsFile -Value "[]" -Encoding UTF8
}

function Get-TicketsData {
    try {
        if (-not (Test-Path $TicketsFile)) { return "[]" }
        $raw = [System.IO.File]::ReadAllText($TicketsFile, [System.Text.Encoding]::UTF8)
        if ([string]::IsNullOrWhiteSpace($raw)) { return "[]" }
        return $raw
    } catch {
        return "[]"
    }
}

function Save-TicketsData([string]$jsonContent) {
    try {
        [System.IO.File]::WriteAllText($TicketsFile, $jsonContent, [System.Text.Encoding]::UTF8)
        return $true
    } catch {
        Write-Host "Error saving tickets: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Get-ParsedTicketsList {
    $raw = Get-TicketsData
    $list = [System.Collections.ArrayList]@()
    if ([string]::IsNullOrWhiteSpace($raw)) { return $list }
    try {
        $parsed = ConvertFrom-Json $raw
        if ($parsed -is [System.Collections.IEnumerable] -and -not ($parsed -is [string])) {
            foreach ($item in $parsed) { [void]$list.Add($item) }
        } elseif ($null -ne $parsed) {
            [void]$list.Add($parsed)
        }
    } catch {}
    return $list
}

function Save-TicketsArrayList($arrList) {
    if ($null -eq $arrList -or $arrList.Count -eq 0) {
        Save-TicketsData "[]"
        return
    }
    $json = $arrList | ConvertTo-Json -Depth 10
    if ([string]::IsNullOrWhiteSpace($json)) {
        Save-TicketsData "[]"
        return
    }
    $trimmed = $json.Trim()
    if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
        $trimmed = "[$trimmed]"
    }
    Save-TicketsData $trimmed
}

function Send-JsonResponse($response, $statusCode, [string]$jsonString) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
}

# Helper for MIME types
function Get-MimeType($extension) {
    switch ($extension.ToLower()) {
        ".html" { "text/html; charset=utf-8" }
        ".htm"  { "text/html; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".json" { "application/json; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".gif"  { "image/gif" }
        ".svg"  { "image/svg+xml" }
        ".ico"  { "image/x-icon" }
        default { "application/octet-stream" }
    }
}

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response

        # CORS Headers for multi-device & cloudflare tunnel access
        $Response.AddHeader("Access-Control-Allow-Origin", "*")
        $Response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        $Response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

        # Handle Preflight OPTIONS
        if ($Request.HttpMethod.ToUpper() -eq "OPTIONS") {
            $Response.StatusCode = 200
            $Response.OutputStream.Close()
            continue
        }

        $UrlPath = $Request.Url.LocalPath
        $Method = $Request.HttpMethod.ToUpper()
        $Timestamp = (Get-Date).ToString("HH:mm:ss")

        try {
            # -------------------------------------------------------------
            # Central REST API Endpoints (/api/tickets)
            # -------------------------------------------------------------
            if ($UrlPath.StartsWith("/api/tickets")) {
                # GET /api/tickets
                if ($Method -eq "GET") {
                    $json = Get-TicketsData
                    Send-JsonResponse $Response 200 $json
                    continue
                }

                # POST /api/tickets (Create, Clear, Bulk Save)
                if ($Method -eq "POST") {
                    $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                    $Body = $Reader.ReadToEnd()

                    if ($UrlPath -eq "/api/tickets/clear") {
                        Save-TicketsData "[]"
                        Send-JsonResponse $Response 200 '{"success":true,"message":"Database cleared"}'
                        Write-Host "[$Timestamp] 200 OK - Admin cleared central database" -ForegroundColor Yellow
                        continue
                    }

                    if ($UrlPath -eq "/api/tickets/bulk" -or $UrlPath -eq "/api/tickets/save-all") {
                        $parsed = @(ConvertFrom-Json $Body)
                        $safeJson = Convert-ToSafeJson $parsed
                        Save-TicketsData $safeJson
                        Send-JsonResponse $Response 200 '{"success":true}'
                        Write-Host "[$Timestamp] 200 OK - Bulk synced $($parsed.Count) tickets" -ForegroundColor Green
                        continue
                    }

                    # Create single complaint
                    $newTicket = ConvertFrom-Json $Body
                    $currentList = Get-ParsedTicketsList
                    $updatedList = [System.Collections.ArrayList]@()
                    [void]$updatedList.Add($newTicket)
                    foreach ($t in $currentList) {
                        if ($t.id -ne $newTicket.id) {
                            [void]$updatedList.Add($t)
                        }
                    }
                    Save-TicketsArrayList $updatedList

                    Write-Host "[$Timestamp] 201 Created - New Complaint $($newTicket.id) from $($newTicket.teacherName) ($($newTicket.teacherClass)-$($newTicket.teacherDivision))" -ForegroundColor Green
                    Send-JsonResponse $Response 201 ($newTicket | ConvertTo-Json -Depth 10)
                    continue
                }

                # PUT /api/tickets (Update Status, Priority, Technician, Notes)
                if ($Method -eq "PUT") {
                    $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                    $Body = $Reader.ReadToEnd()
                    $updatedTicket = ConvertFrom-Json $Body

                    $currentList = Get-ParsedTicketsList
                    $updatedList = [System.Collections.ArrayList]@()
                    $found = $false
                    foreach ($t in $currentList) {
                        if ($t.id -eq $updatedTicket.id) {
                            [void]$updatedList.Add($updatedTicket)
                            $found = $true
                        } else {
                            [void]$updatedList.Add($t)
                        }
                    }
                    if (-not $found) {
                        [void]$updatedList.Insert(0, $updatedTicket)
                    }
                    Save-TicketsArrayList $updatedList

                    Write-Host "[$Timestamp] 200 OK - Updated $($updatedTicket.id) [Status: $($updatedTicket.status), Priority: $($updatedTicket.priority)]" -ForegroundColor Cyan
                    Send-JsonResponse $Response 200 ($updatedTicket | ConvertTo-Json -Depth 10)
                    continue
                }

                # DELETE /api/tickets
                if ($Method -eq "DELETE") {
                    $idToDelete = $Request.QueryString["id"]
                    if ([string]::IsNullOrWhiteSpace($idToDelete)) {
                        $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                        $Body = $Reader.ReadToEnd()
                        if (-not [string]::IsNullOrWhiteSpace($Body)) {
                            try { $idToDelete = (ConvertFrom-Json $Body).id } catch {}
                        }
                    }
                    if (-not [string]::IsNullOrWhiteSpace($idToDelete)) {
                        $currentList = Get-ParsedTicketsList
                        $updatedList = [System.Collections.ArrayList]@()
                        foreach ($t in $currentList) {
                            if ($t.id -ne $idToDelete) {
                                [void]$updatedList.Add($t)
                            }
                        }
                        Save-TicketsArrayList $updatedList
                        Send-JsonResponse $Response 200 '{"success":true}'
                        Write-Host "[$Timestamp] 200 OK - Deleted ticket $idToDelete" -ForegroundColor Yellow
                    } else {
                        Send-JsonResponse $Response 400 '{"error":"Missing ticket ID"}'
                    }
                    continue
                }
            }

            # -------------------------------------------------------------
            # Static File Serving
            # -------------------------------------------------------------
            if ($UrlPath -eq "/" -or $UrlPath -eq "") {
                $UrlPath = "/index.html"
            }

            $CleanPath = $UrlPath.TrimStart("/").Replace("/", "\")
            $FilePath = Join-Path $ScriptDir $CleanPath

            if (Test-Path $FilePath -PathType Leaf) {
                $Extension = [System.IO.Path]::GetExtension($FilePath)
                $Mime = Get-MimeType $Extension
                $Response.ContentType = $Mime

                $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
                $Response.ContentLength64 = $Bytes.Length
                $Response.StatusCode = 200
                $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
                $Response.OutputStream.Close()
            } else {
                $Response.StatusCode = 404
                $NotFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $UrlPath")
                $Response.ContentLength64 = $NotFoundMsg.Length
                $Response.OutputStream.Write($NotFoundMsg, 0, $NotFoundMsg.Length)
                $Response.OutputStream.Close()
                Write-Host "[$Timestamp] 404 Not Found - $UrlPath" -ForegroundColor Red
            }
        } catch {
            Write-Host "[$Timestamp] 500 Error: $($_.Exception.Message)" -ForegroundColor Red
            try {
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Internal Server Error"}')
                $Response.StatusCode = 500
                $Response.ContentType = "application/json; charset=utf-8"
                $Response.ContentLength64 = $errBytes.Length
                $Response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                $Response.OutputStream.Close()
            } catch {}
        }
    }
} finally {
    try {
        $Listener.Stop()
        $Listener.Close()
    } catch {}
}
