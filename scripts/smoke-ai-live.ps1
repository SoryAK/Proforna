$ErrorActionPreference = "Stop"

# Quote-stripping .env loader. Required because `.env` here writes values as
# KEY="value"; PowerShell's plain split-on-= treats the surrounding quotes as
# part of the value, so Gemini would receive ?key="AIza..." and reject as 400.
Get-Content .env | ForEach-Object {
  if ($_ -match "^(GEMINI_|OLLAMA_)" -and $_ -notmatch "^#") {
    $parts = $_ -split "=", 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

# Force the Ollama model to the one actually installed locally.
$env:OLLAMA_MODEL = "gemma4:26b"
$env:RUN_LIVE_SMOKE_AI = "1"

try {
  npm test -- --run src/lib/ai/smoke.live.test.ts --reporter=verbose 2>&1
} finally {
  Remove-Item Env:GEMINI_API_KEY, Env:GEMINI_MODEL, Env:OLLAMA_MODEL, Env:RUN_LIVE_SMOKE_AI -ErrorAction SilentlyContinue
}
