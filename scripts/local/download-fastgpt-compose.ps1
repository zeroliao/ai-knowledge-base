param(
  [string]$TargetDir = "runtime\fastgpt",
  [string]$Version = "v4.14"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

$files = @(
  @{
    Name = "docker-compose.pg.yml"
    Uri = "https://doc.fastgpt.cn/deploy/docker/$Version/global/docker-compose.pg.yml"
  },
  @{
    Name = "config.json"
    Uri = "https://doc.fastgpt.cn/deploy/config/config.json"
  }
)

foreach ($file in $files) {
  $path = Join-Path $TargetDir $file.Name
  Write-Output "Downloading $($file.Uri)"
  Invoke-WebRequest -UseBasicParsing -Uri $file.Uri -OutFile $path -TimeoutSec 60
}

Write-Output "Downloaded FastGPT official compose files to $TargetDir"
