param(
  [int]$ExpectedDimension = 2048,
  [string]$ContainerName = '',
  [string]$Database = 'fastgpt',
  [string]$DatabaseUser = 'postgres'
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
Set-Location -LiteralPath $workspaceRoot

if ($ExpectedDimension -lt 1 -or $ExpectedDimension -gt 4000) {
  throw 'ExpectedDimension must be between 1 and 4000.'
}

$envSource = Get-Content -Raw -Encoding UTF8 'fastgpt\packages\service\env.ts'
if ($envSource -notmatch "VECTOR_DIMENSION:\s*IntSchema\.min\(1\)\.max\(4000\)\.default\($ExpectedDimension\)") {
  throw "The default VECTOR_DIMENSION is not $ExpectedDimension. Pass the deployed contract explicitly or update the code first."
}

$embeddingSource = Get-Content -Raw -Encoding UTF8 'fastgpt\packages\service\core\ai\embedding\index.ts'
$pgSource = Get-Content -Raw -Encoding UTF8 'fastgpt\packages\service\common\vectorDB\pg\index.ts'
$pgContract = [regex]::Escape('vector HALFVEC(${VECTOR_DIMENSION})')
if ($embeddingSource -notmatch 'common/vectorDB/dimension' -or $pgSource -notmatch $pgContract) {
  throw 'Embedding and PostgreSQL vector schema do not share the VECTOR_DIMENSION contract.'
}
Write-Output "Code contract passed: VECTOR_DIMENSION=$ExpectedDimension"

if ([string]::IsNullOrWhiteSpace($ContainerName)) {
  Write-Output 'Database check skipped. Pass -ContainerName to inspect modeldata.vector in a local PostgreSQL container.'
  exit 0
}

$query = "SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid WHERE c.relname = 'modeldata' AND a.attname = 'vector' AND a.attnum > 0 AND NOT a.attisdropped;"
$actual = (& docker exec $ContainerName psql -U $DatabaseUser -d $Database -Atqc $query 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw "Cannot read PostgreSQL modeldata.vector (container=$ContainerName). Check container, database and user."
}
$actual = ($actual | Select-Object -Last 1).ToString().Trim()
if ([string]::IsNullOrWhiteSpace($actual)) {
  throw 'modeldata.vector column was not found; initialize the local vector database first.'
}
if ($actual -notmatch "\(($ExpectedDimension)\)$") {
  throw "Vector dimension mismatch: code contract=$ExpectedDimension, database column=$actual. Rebuild local modeldata and re-embed before training."
}
Write-Output "Database contract passed: modeldata.vector=$actual"
