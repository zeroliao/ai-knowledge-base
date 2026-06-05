param(
  [string]$EnvFile = ".env.local",
  [string]$ComposeFile = "runtime\fastgpt\docker-compose.pg.yml",
  [string]$OverrideFile = "runtime\fastgpt\docker-compose.local.override.yml"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing $EnvFile. Run scripts/local/prepare.ps1 first."
}

$dockerInfo = docker info --format '{{.ServerVersion}}' 2>$null
if (-not $dockerInfo) {
  throw "Docker is not running. Start Docker Desktop, then run this script again."
}

Write-Output "Docker server: $dockerInfo"

if (-not (Test-Path -LiteralPath $ComposeFile)) {
  Write-Output "Missing $ComposeFile. Downloading FastGPT official compose files..."
  powershell -ExecutionPolicy Bypass -File .\scripts\local\download-fastgpt-compose.ps1
}

if (-not (Test-Path -LiteralPath $ComposeFile)) {
  throw "Missing $ComposeFile after download."
}

if (Test-Path -LiteralPath $OverrideFile) {
  docker compose --env-file $EnvFile -f $ComposeFile -f $OverrideFile up -d
} else {
  docker compose --env-file $EnvFile -f $ComposeFile up -d
}
Write-Output "FastGPT local stack started."
