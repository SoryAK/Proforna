<#
.SYNOPSIS
  Orchestrator-Executor codegen loop using a local Ollama model.

.DESCRIPTION
  Implements the pattern where a premium model (Copilot) drafts a tight
  spec, and a local Ollama model (gemma4:26b by default) executes it.
  This script POSTs the spec to Ollama's /api/generate, extracts fenced
  code blocks from the response, writes them to the supplied file paths,
  runs the test command, and — on failure — feeds the test output back
  to the model as a repair prompt. Loops up to -MaxAttempts times.

  No Cline, no Continue, no VS Code extension. Just stdio + HTTP +
  vitest. Designed for the Resumsify dev workflow where premium-request
  burn is the binding constraint.

.PARAMETER Spec
  Full spec text sent to the model. Must request N fenced code blocks
  matching the N OutFiles in the same order.

.PARAMETER OutFiles
  File paths to write, in the order code blocks should appear in the
  response.

.PARAMETER TestCommand
  Shell command run after each file write. Non-zero exit feeds output
  back to the model as a repair prompt.

.PARAMETER MaxAttempts
  Cap on repair iterations. Default 3.

.PARAMETER Model
  Ollama model tag. Default "gemma4:26b".

.EXAMPLE
  ./scripts/ollama-codegen.ps1 `
    -Spec (Get-Content spec.txt -Raw) `
    -OutFiles "src/lib/foo.ts","src/lib/foo.test.ts" `
    -TestCommand "npx vitest run src/lib/foo.test.ts"
#>
param(
    [Parameter(Mandatory)][string]$Spec,
    [Parameter(Mandatory)][string[]]$OutFiles,
    [string]$TestCommand,
    [int]$MaxAttempts = 3,
    [string]$Model = "gemma4:26b"
)

$ErrorActionPreference = "Stop"

function Invoke-Ollama {
    param([string]$Prompt, [string]$Model)
    $body = @{
        model = $Model
        prompt = $Prompt
        stream = $false
        options = @{ temperature = 0.2 }
    } | ConvertTo-Json -Depth 5
    $r = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" `
        -Method Post -Body $body -ContentType "application/json" -TimeoutSec 600
    return $r.response
}

function Get-CodeBlocks {
    param([string]$Text)
    $pattern = '(?ms)```(?:typescript|ts|javascript|js)?\r?\n(.+?)\r?\n```'
    return [regex]::Matches($Text, $pattern) | ForEach-Object { $_.Groups[1].Value }
}

function Write-FileNoBom {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText(
        (Resolve-Path -LiteralPath (Split-Path $Path -Parent)).Path + "\" + (Split-Path $Path -Leaf),
        $Content,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$attempt = 0
$currentPrompt = $Spec
$totalSec = 0

while ($attempt -lt $MaxAttempts) {
    $attempt++
    Write-Host ""
    Write-Host "=== Attempt $attempt / $MaxAttempts ===" -ForegroundColor Cyan

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-Ollama -Prompt $currentPrompt -Model $Model
    $sw.Stop()
    $totalSec += $sw.Elapsed.TotalSeconds
    Write-Host ("Ollama: {0:F1}s, response {1} chars" -f $sw.Elapsed.TotalSeconds, $response.Length) -ForegroundColor Gray

    $blocks = @(Get-CodeBlocks -Text $response)
    if ($blocks.Count -lt $OutFiles.Count) {
        Write-Host "  Expected $($OutFiles.Count) code blocks, got $($blocks.Count). Surfacing raw response:" -ForegroundColor Yellow
        Write-Host $response
        exit 2
    }

    for ($i = 0; $i -lt $OutFiles.Count; $i++) {
        Write-FileNoBom -Path $OutFiles[$i] -Content $blocks[$i]
        Write-Host "  wrote $($OutFiles[$i])" -ForegroundColor Green
    }

    if (-not $TestCommand) {
        Write-Host "No test command provided; stopping after first write." -ForegroundColor Yellow
        break
    }

    Write-Host "Running tests..." -ForegroundColor Gray
    $testOutput = (Invoke-Expression "$TestCommand 2>&1" | Out-String).Trim()
    $testExitCode = $LASTEXITCODE

    if ($testExitCode -eq 0) {
        Write-Host ""
        Write-Host ("=== PASS in {0} attempt(s), total {1:F1}s ===" -f $attempt, $totalSec) -ForegroundColor Green
        ($testOutput -split "`r?`n") | Select-Object -Last 8 | ForEach-Object { Write-Host $_ }
        exit 0
    }

    Write-Host "Tests failed (exit $testExitCode). Asking gemma to repair..." -ForegroundColor Yellow
    ($testOutput -split "`r?`n") | Select-Object -Last 12 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

    $currentPrompt = @"
You previously wrote files for this spec:

$Spec

The tests failed with this output:

``````
$testOutput
``````

Output the COMPLETE corrected files again, in the SAME order and SAME number of fenced code blocks (one block per file). No prose outside code blocks. Fix only what the test output indicates is wrong.
"@
}

Write-Host ""
Write-Host ("=== FAIL after {0} attempts, total {1:F1}s ===" -f $MaxAttempts, $totalSec) -ForegroundColor Red
exit 1
