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
$chatModel = $envMap["CHAT_MODEL"]
$embeddingModel = $envMap["EMBEDDING_MODEL"]

if (-not $baseUrl -or -not $apiKey) {
  throw "SUB2API_BASE_URL or SUB2API_API_KEY missing in $EnvFile"
}

$apiRoot = $baseUrl.TrimEnd("/")
if ($apiRoot -notmatch '/v1$') {
  $apiRoot = "$apiRoot/v1"
}
$embeddingRoot = $embeddingBaseUrl
if (-not $embeddingRoot) { $embeddingRoot = $baseUrl }
$embeddingRoot = $embeddingRoot.TrimEnd("/")
if ($embeddingRoot -match '/anthropic$') {
  $embeddingRoot = $embeddingRoot -replace '/anthropic$', '/v1'
} elseif ($embeddingRoot -notmatch '/v1$') {
  $embeddingRoot = "$embeddingRoot/v1"
}
if (-not $embeddingApiKey) { $embeddingApiKey = $apiKey }

Write-Output "Checking sub2api base URL without printing secrets..."

if ($chatModel) {
  $body = @{
    model = $chatModel
    messages = @(@{ role = "user"; content = "Return only: ok" })
    max_tokens = 8
  } | ConvertTo-Json -Depth 5
  $headers = @{ Authorization = "Bearer $apiKey"; "Content-Type" = "application/json" }
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$apiRoot/chat/completions" -Headers $headers -Body $body -TimeoutSec 30
    Write-Output "Chat model check: ok"
  } catch {
    Write-Output "Chat model check failed: $($_.Exception.Message)"
  }
} else {
  Write-Output "Chat model check skipped: CHAT_MODEL is empty."
}

if ($embeddingModel) {
  $body = @{
    model = $embeddingModel
    input = "FastGPT knowledge base embedding check"
  } | ConvertTo-Json -Depth 5
  $headers = @{ Authorization = "Bearer $embeddingApiKey"; "Content-Type" = "application/json" }
  try {
    $response = Invoke-RestMethod -Method Post -Uri "$embeddingRoot/embeddings" -Headers $headers -Body $body -TimeoutSec 30
    Write-Output "Embedding model check: ok"
  } catch {
    Write-Output "Embedding model check failed: $($_.Exception.Message)"
  }
} else {
  Write-Output "Embedding model check skipped: EMBEDDING_MODEL is empty."
}
