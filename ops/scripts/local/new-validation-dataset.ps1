param(
  [string]$Prefix = 'local-validation',
  [int]$VectorDimension = 2048
)

$ErrorActionPreference = 'Stop'
if ($Prefix -notmatch '^[a-z0-9][a-z0-9-]{2,40}$') {
  throw 'Prefix must contain only lowercase letters, numbers and hyphens.'
}
if ($VectorDimension -lt 1 -or $VectorDimension -gt 4000) {
  throw 'VectorDimension must be between 1 and 4000.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
$stateDir = Join-Path $workspaceRoot 'artifacts\local-validation'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$datasetName = "$Prefix-$stamp"
$state = [ordered]@{
  datasetName = $datasetName
  vectorDimension = $VectorDimension
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  note = 'Create this dataset in the local FastGPT UI. This file contains no credentials or dataset content.'
}
$state | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $stateDir 'current.json') -Encoding UTF8
Write-Output "Create a new local FastGPT dataset named: $datasetName"
Write-Output "Vector dimension contract: $VectorDimension"
Write-Output "State written to artifacts\local-validation\current.json (ignored by Git)."
Write-Output 'Do not reuse stale validation datasets created before the current model configuration.'
