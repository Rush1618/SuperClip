# SupoClip Local Setup & Launch Script (Windows)
$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting SupoClip Local Environment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Configure Ollama Environment
$env:OLLAMA_MODELS = "C:\Rushabh\.models"
$env:OLLAMA_HOST = "0.0.0.0:11434"

# Potential Ollama executable locations
$candidatePaths = @(
    "C:\Users\singh\AppData\Local\Programs\Ollama\ollama.exe",
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "$env:ProgramFiles\Ollama\ollama.exe"
)
$ollamaExe = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ollamaExe) {
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { $ollamaExe = $cmd.Source }
}

# 2. Check and start Ollama if not already running
Write-Host "`n[1/3] Checking Ollama service..." -ForegroundColor Yellow
$ollamaRunning = $false
try {
    $res = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($res) { $ollamaRunning = $true }
} catch {
    $ollamaRunning = $false
}

if (-not $ollamaRunning) {
    if ($ollamaExe -and (Test-Path $ollamaExe)) {
        Write-Host "Ollama is not running. Automatically starting Ollama in background (RTX acceleration enabled)..." -ForegroundColor Green
        Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
        
        # Poll health endpoint until responsive (up to 20 seconds)
        $ready = $false
        for ($i = 1; $i -le 10; $i++) {
            Start-Sleep -Seconds 2
            try {
                $res = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($res) {
                    $ready = $true
                    break
                }
            } catch {}
            Write-Host "  Waiting for Ollama to become ready ($($i * 2)s)..." -ForegroundColor Gray
        }
        if ($ready) {
            Write-Host "Ollama service started and responding at http://localhost:11434" -ForegroundColor Green
        } else {
            Write-Warning "Ollama process launched but endpoint not yet responding. Proceeding with container startup..."
        }
    } else {
        Write-Warning "Ollama executable not found. Please start Ollama manually if running local models."
    }
} else {
    Write-Host "Ollama is already running and reachable at http://localhost:11434" -ForegroundColor Green
}

# 3. Start SupoClip Docker containers
Write-Host "`n[2/3] Starting SupoClip Docker containers..." -ForegroundColor Yellow
docker compose up -d

# 4. Ready!
Write-Host "`n[3/3] SupoClip is running!" -ForegroundColor Green
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "Frontend:    http://localhost:3107" -ForegroundColor White
Write-Host "Backend API: http://localhost:8000" -ForegroundColor White
Write-Host "API Docs:    http://localhost:8000/docs" -ForegroundColor White
Write-Host "LLM:         Ollama (qwen3.5:4b / qwen3.5:9b)" -ForegroundColor White
Write-Host "Transcriber: Local Whisper (OpenAI)" -ForegroundColor White
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "Opening web browser at http://localhost:3107..." -ForegroundColor Yellow
Start-Process "http://localhost:3107"

