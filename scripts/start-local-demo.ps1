$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
  throw 'Dependências não encontradas. Instale as dependências do clone antes de iniciar.'
}

$apiPort = Get-NetTCPConnection -LocalPort 4180 -State Listen -ErrorAction SilentlyContinue
if (-not $apiPort) {
  Start-Process -FilePath 'node' -ArgumentList 'scripts/local-demo-api.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

$env:VITE_AUTH_API_URL = 'http://127.0.0.1:4180'
$env:VITE_API_URL = 'http://127.0.0.1:4180'
$env:VITE_COMMERCIAL_ASSISTANT_URL = 'http://127.0.0.1:3001'
npm run build
if ($LASTEXITCODE -ne 0) { throw 'A compilação do frontend falhou.' }

$previewPort = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
if (-not $previewPort) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','preview','--','--host','127.0.0.1','--port','5174','--strictPort' -WorkingDirectory $projectRoot -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Write-Host 'Demonstração disponível em http://127.0.0.1:5174/login'
Write-Host 'Conta fictícia: demo@sofia.local / SofiaDemo2026!'
