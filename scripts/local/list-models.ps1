param(
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing $EnvFile. Run scripts/local/prepare.ps1 first."
}

$envMap = @{}
foreach ($line in Get-Content -Encoding UTF8 -LiteralPath $EnvFile) {
  if ($line -match '^\s*#' -or -not $line.Trim()) { continue }
  $parts = $line -split '=', 2
  if ($parts.Count -eq 2) {
    $envMap[$parts[0]] = $parts[1]
  }
}

$baseUrl = $envMap["SUB2API_BASE_URL"]
$apiKey = $envMap["SUB2API_API_KEY"]
$embeddingBaseUrl = $envMap["EMBEDDING_BASE_URL"]
$embeddingApiKey = $envMap["EMBEDDING_API_KEY"]

if (-not $baseUrl -or -not $apiKey) {
  throw "SUB2API_BASE_URL or SUB2API_API_KEY missing in $EnvFile"
}

$apiRoot = $baseUrl.TrimEnd("/")
if ($apiRoot -notmatch '/v1$') {
  $apiRoot = "$apiRoot/v1"
}

$headers = @{ Authorization = "Bearer $apiKey" }

try {
  $response = Invoke-RestMethod -Method Get -Uri "$apiRoot/models" -Headers $headers -TimeoutSec 30
  if ($response.data) {
    $response.data | ForEach-Object { $_.id } | Sort-Object
  } else {
    Write-Output "No model list returned from $baseUrl/v1/models"
  }
} catch {
  Write-Output "Model list check failed: $($_.Exception.Message)"
}

if ($embeddingBaseUrl) {
  $embeddingRoot = $embeddingBaseUrl.TrimEnd("/")
  if ($embeddingRoot -match '/anthropic$') {
    $embeddingRoot = $embeddingRoot -replace '/anthropic$', '/v1'
  } elseif ($embeddingRoot -notmatch '/v1$') {
    $embeddingRoot = "$embeddingRoot/v1"
  }
  if (-not $embeddingApiKey) { $embeddingApiKey = $apiKey }
  $embeddingHeaders = @{ Authorization = "Bearer $embeddingApiKey" }
  Write-Output "--- embedding models ---"
  try {
    $response = Invoke-RestMethod -Method Get -Uri "$embeddingRoot/models" -Headers $embeddingHeaders -TimeoutSec 30
    if ($response.data) {
      $response.data | ForEach-Object { $_.id } | Sort-Object
    } else {
      Write-Output "No model list returned from embedding endpoint."
    }
  } catch {
    Write-Output "Embedding model list check failed: $($_.Exception.Message)"
  }
}
