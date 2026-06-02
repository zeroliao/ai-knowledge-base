param(
  [Parameter(Mandatory = $true)][string]$ChatModel,
  [Parameter(Mandatory = $true)][string]$EmbeddingModel,
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing $EnvFile. Run scripts/local/prepare.ps1 first."
}

$lines = Get-Content -Encoding UTF8 -LiteralPath $EnvFile
$updated = foreach ($line in $lines) {
  if ($line -match '^CHAT_MODEL=') {
    "CHAT_MODEL=$ChatModel"
  } elseif ($line -match '^EMBEDDING_MODEL=') {
    "EMBEDDING_MODEL=$EmbeddingModel"
  } else {
    $line
  }
}

Set-Content -LiteralPath $EnvFile -Encoding UTF8 -Value $updated
Write-Output "Updated CHAT_MODEL and EMBEDDING_MODEL in $EnvFile"
