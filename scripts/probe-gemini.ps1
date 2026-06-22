$ErrorActionPreference = "Continue"

function Read-EnvValue([string]$name) {
  $line = Get-Content .env | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $raw = ($line -split "=", 2)[1].Trim()
  # Strip surrounding double or single quotes if present.
  if (($raw.StartsWith('"') -and $raw.EndsWith('"')) -or ($raw.StartsWith("'") -and $raw.EndsWith("'"))) {
    return $raw.Substring(1, $raw.Length - 2)
  }
  return $raw
}

$apiKey = Read-EnvValue "GEMINI_API_KEY"
$gem = Read-EnvValue "GEMINI_MODEL"
Write-Host "GEMINI_MODEL in .env (unquoted): '$gem' (len=$($gem.Length))"
Write-Host "API key length (unquoted): $($apiKey.Length)"

function Probe-Model([string]$model) {
  $body = @{ contents = @(@{ parts = @(@{ text = "say pong" }) }) } | ConvertTo-Json -Depth 5 -Compress
  $url = "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=$apiKey"
  try {
    $r = Invoke-RestMethod -Uri $url -Method POST -Body $body -ContentType "application/json"
    Write-Host "[OK]  $model => $($r.candidates[0].content.parts[0].text.Trim())"
  } catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host "[ERR] $model => $msg"
  }
}

Probe-Model "gemini-2.0-flash-lite"
Probe-Model "gemini-2.0-flash"
Probe-Model "gemini-1.5-flash"
Probe-Model "gemini-2.5-pro"
Probe-Model "gemini-1.5-pro"
