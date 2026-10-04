param(
  [string]$FixtureDirectory = "ops\tests\fixtures",
  [switch]$RequireBinaryDocuments
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Resolve-Path (Join-Path $scriptDir "..\..\..")
Set-Location -LiteralPath $workspaceRoot
$fixtureRoot = (Resolve-Path -LiteralPath $FixtureDirectory).Path

$required = @(
  @{ Name = 'ai-knowledge-overview.md'; Type = 'Markdown' },
  @{ Name = 'mcp-agent-notes.txt'; Type = 'TXT' },
  @{ Name = 'manual-text.txt'; Type = 'manual text' },
  @{ Name = 'acceptance-questions.md'; Type = 'acceptance questions' }
)
foreach ($item in $required) {
  $path = Join-Path $fixtureRoot $item.Name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw ('Missing {0} fixture: {1}. Run generate-fixtures.ps1 first.' -f $item.Type, $path)
  }
}

$documentPairs = @(
  @{ 'Binary' = 'deployment-checklist.docx'; 'Fallback' = 'deployment-checklist.docx.txt'; 'Type' = 'DOCX' },
  @{ 'Binary' = 'citation-policy.pdf'; 'Fallback' = 'citation-policy.pdf.txt'; 'Type' = 'PDF' }
)
foreach ($pair in $documentPairs) {
  $binaryPath = Join-Path $fixtureRoot $pair.Binary
  $fallbackPath = Join-Path $fixtureRoot $pair.Fallback
  if (Test-Path -LiteralPath $binaryPath -PathType Leaf) {
    Write-Output ('[{0}] binary fixture present: {1}' -f $pair.Type, $pair.Binary)
    continue
  }
  if ($RequireBinaryDocuments) {
    throw ('Missing binary {0} fixture: {1}. Text fallback cannot verify parser behavior.' -f $pair.Type, $binaryPath)
  }
  if (-not (Test-Path -LiteralPath $fallbackPath -PathType Leaf)) {
    throw ('Missing {0} fixture and text fallback: {1} / {2}' -f $pair.Type, $binaryPath, $fallbackPath)
  }
  Write-Warning ('[{0}] using text fallback; run generate-fixtures.ps1 on a host with Word before parser acceptance.' -f $pair.Type)
}

Write-Output "Fixture validation passed: $fixtureRoot"
Get-ChildItem -LiteralPath $fixtureRoot -File |
  Where-Object { $_.Name -in ($required.Name + $documentPairs.Binary + $documentPairs.Fallback) } |
  Sort-Object Name |
  ForEach-Object { $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256; Write-Output ("{0} {1} {2}" -f $_.Name, $_.Length, $hash.Hash) }
