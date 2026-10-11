# Kontor - lokaler On-Premise-Server (Windows, ohne Installation)
# Nutzt nur Bordmittel von Windows (PowerShell + .NET HttpListener).
# Aufruf:  kontor-start.bat            -> nur dieser PC (http://localhost:8080)
#          kontor-start-netzwerk.bat   -> auch Tablets/Kassen im Netzwerk (Administratorrechte)
param(
  [int]$Port = 8080,
  [switch]$Lan
)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Kontor Server'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\ui-preview')).Path.TrimEnd('\')
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.txt' = 'text/plain; charset=utf-8'
}

function New-Listener([string]$prefix) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add($prefix)
  $l.Start()
  return $l
}

Write-Host ''
Write-Host '  KONTOR  -  lokaler Server' -ForegroundColor Yellow
Write-Host '  ------------------------------------------------'

try {
  if ($Lan) { $listener = New-Listener "http://+:$Port/" } else { $listener = New-Listener "http://localhost:$Port/" }
} catch {
  if ($Lan) {
    Write-Host '  Netzwerkmodus braucht Administratorrechte - starte nur fuer diesen PC.' -ForegroundColor DarkYellow
    $Lan = $false
    try { $listener = New-Listener "http://localhost:$Port/" } catch {
      Write-Host "  Port $Port ist belegt. Anderes Programm schliessen oder mit -Port 8090 starten." -ForegroundColor Red
      Read-Host '  Enter zum Beenden'; exit 1
    }
  } else {
    Write-Host "  Port $Port ist belegt. Anderes Programm schliessen oder mit -Port 8090 starten." -ForegroundColor Red
    Read-Host '  Enter zum Beenden'; exit 1
  }
}

Write-Host "  Auf diesem PC:   http://localhost:$Port" -ForegroundColor Green
if ($Lan) {
  try {
    if (-not (Get-NetFirewallRule -DisplayName "Kontor $Port" -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName "Kontor $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private | Out-Null
      Write-Host "  Firewall-Regel 'Kontor $Port' angelegt (nur privates Netzwerk)."
    }
  } catch { Write-Host '  Firewall-Regel konnte nicht angelegt werden - ggf. manuell freigeben.' -ForegroundColor DarkYellow }
  try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      ForEach-Object { Write-Host "  Im Netzwerk:     http://$($_.IPAddress):$Port   ($($_.InterfaceAlias))" -ForegroundColor Green }
  } catch { Write-Host '  IP-Adresse mit "ipconfig" nachsehen.' }
}
Write-Host '  Beenden: dieses Fenster schliessen oder Strg+C'
Write-Host '  ------------------------------------------------'
Write-Host ''

Start-Process "http://localhost:$Port/"

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(500)) { }   # erlaubt Strg+C
    $ctx = $task.GetAwaiter().GetResult()
    $req = $ctx.Request; $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
      if ($rel -eq '') { $rel = 'index.html' }
      $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
      $status = 200
      if (-not $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $status = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Nicht gefunden')
        $res.ContentType = 'text/plain; charset=utf-8'
      } else {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLower()
        if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
      }
      $res.StatusCode = $status
      $res.Headers['Cache-Control'] = 'no-cache'
      $res.Headers['X-Content-Type-Options'] = 'nosniff'
      $res.ContentLength64 = $bytes.Length
      if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      Write-Host ("  {0:HH:mm:ss}  {1}  {2,-4} {3}  ({4})" -f (Get-Date), $status, $req.HttpMethod, $req.Url.AbsolutePath, $req.RemoteEndPoint.Address)
    } catch {
      Write-Host "  Fehler: $($_.Exception.Message)" -ForegroundColor Red
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.OutputStream.Close() } catch { }
    }
  }
} finally {
  $listener.Stop(); $listener.Close()
  Write-Host '  Server gestoppt.'
}
