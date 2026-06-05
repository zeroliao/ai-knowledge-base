param(
  [string]$SitemapUrl = "https://869hr.uk/sitemap.xml",
  [string]$OutputDir = "storage\web\869hr",
  [int]$Limit = 0,
  [int]$DelayMs = 500,
  [switch]$IncludeNonArticleUrls,
  [switch]$Overwrite
)

$ErrorActionPreference = "Stop"

function ConvertTo-SafeFileName {
  param([string]$Value)
  $decoded = [System.Uri]::UnescapeDataString($Value.Trim("/"))
  $safe = $decoded -replace '[\\/:*?"<>|]+', "-"
  $safe = $safe -replace '\s+', "-"
  $safe = $safe.Trim("-")
  if ($safe.Length -gt 120) {
    $safe = $safe.Substring($safe.Length - 120)
  }
  if (-not $safe) { $safe = "index" }
  return $safe
}

function ConvertTo-MarkdownText {
  param([string]$Html)

  $content = $Html
  $articleMatch = [regex]::Match($content, '(?is)<article\b[^>]*>(.*?)</article>')
  if ($articleMatch.Success) {
    $content = $articleMatch.Groups[1].Value
  } else {
    $mainMatch = [regex]::Match($content, '(?is)<main\b[^>]*>(.*?)</main>')
    if ($mainMatch.Success) {
      $content = $mainMatch.Groups[1].Value
    } else {
      $bodyMatch = [regex]::Match($content, '(?is)<body\b[^>]*>(.*?)</body>')
      if ($bodyMatch.Success) {
        $content = $bodyMatch.Groups[1].Value
      }
    }
  }

  $content = [regex]::Replace($content, '(?is)<(script|style|noscript|svg|form|nav|footer|header)\b.*?</\1>', "`n")
  $content = [regex]::Replace($content, '(?is)<h1\b[^>]*>(.*?)</h1>', "`n# `$1`n")
  $content = [regex]::Replace($content, '(?is)<h2\b[^>]*>(.*?)</h2>', "`n## `$1`n")
  $content = [regex]::Replace($content, '(?is)<h3\b[^>]*>(.*?)</h3>', "`n### `$1`n")
  $content = [regex]::Replace($content, '(?is)<li\b[^>]*>(.*?)</li>', "`n- `$1")
  $content = [regex]::Replace($content, '(?is)</p\s*>', "`n`n")
  $content = [regex]::Replace($content, '(?is)<br\s*/?>', "`n")
  $content = [regex]::Replace($content, '(?is)<[^>]+>', " ")
  $content = [System.Net.WebUtility]::HtmlDecode($content)
  $content = $content -replace "`r", "`n"
  $content = [regex]::Replace($content, "[ `t]+", " ")
  $content = [regex]::Replace($content, " *`n *", "`n")
  $content = [regex]::Replace($content, "(`n){3,}", "`n`n")
  return $content.Trim()
}

function Get-HtmlTitle {
  param([string]$Html)
  $match = [regex]::Match($Html, '(?is)<title\b[^>]*>(.*?)</title>')
  if ($match.Success) {
    $title = [System.Net.WebUtility]::HtmlDecode(($match.Groups[1].Value -replace '<[^>]+>', ' '))
    $title = $title -replace '\s+', ' '
    $title = [regex]::Replace($title, '\s*\|\s*869HR.*$', '')
    $title = [regex]::Replace($title, '\s+-\s+869HR.*$', '')
    return $title.Trim()
  }
  return ""
}

function Get-PublishedAt {
  param([string]$Html)
  $match = [regex]::Match($Html, '(?is)<time\b[^>]*datetime=["'']([^"'']+)["''][^>]*>')
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }
  return ""
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$rawDir = Join-Path $OutputDir "raw"
$markdownDir = Join-Path $OutputDir "markdown"
New-Item -ItemType Directory -Force -Path $rawDir, $markdownDir | Out-Null

Write-Output "Downloading sitemap: $SitemapUrl"
$sitemapContent = (Invoke-WebRequest -UseBasicParsing -Uri $SitemapUrl -TimeoutSec 60).Content
[xml]$sitemap = $sitemapContent

$ns = New-Object System.Xml.XmlNamespaceManager($sitemap.NameTable)
$ns.AddNamespace("sm", "http://www.sitemaps.org/schemas/sitemap/0.9")
$urls = $sitemap.SelectNodes("//sm:url/sm:loc", $ns) | ForEach-Object { $_."#text" }

if (-not $IncludeNonArticleUrls) {
  $urls = $urls | Where-Object { $_ -match '^https://869hr\.uk/\d{4}/[^/]+/[^/]+/?$' }
}

$urls = @($urls | Sort-Object -Unique)
if ($Limit -gt 0) {
  $urls = @($urls | Select-Object -First $Limit)
}

$urlListPath = Join-Path $OutputDir "urls.txt"
$urls | Set-Content -LiteralPath $urlListPath -Encoding UTF8
Write-Output "Article URL count: $($urls.Count)"
Write-Output "URL list: $urlListPath"

$manifestRows = New-Object System.Collections.Generic.List[string]
$manifestRows.Add("status,url,title,file,published_at,error")

$index = 0
foreach ($url in $urls) {
  $index++
  $uri = [System.Uri]$url
  $slug = ConvertTo-SafeFileName -Value $uri.AbsolutePath
  $rawPath = Join-Path $rawDir "$slug.html"
  $markdownPath = Join-Path $markdownDir "$slug.md"

  if ((Test-Path -LiteralPath $markdownPath) -and -not $Overwrite) {
    Write-Output "[$index/$($urls.Count)] skip existing $url"
    $manifestRows.Add(("skipped,""{0}"","""",""{1}"","""",""""" -f $url, $markdownPath))
    continue
  }

  try {
    Write-Output "[$index/$($urls.Count)] fetch $url"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 60 -Headers @{
      "User-Agent" = "ai-knowledge-base-sitemap-export/1.0"
    }
    $html = $response.Content
    Set-Content -LiteralPath $rawPath -Encoding UTF8 -Value $html

    $title = Get-HtmlTitle -Html $html
    if (-not $title) { $title = $slug }
    $publishedAt = Get-PublishedAt -Html $html
    $body = ConvertTo-MarkdownText -Html $html

    $markdown = @(
      "---",
      "title: $title",
      "source_url: $url",
      "source_type: url",
      "published_at: $publishedAt",
      "captured_at: $((Get-Date).ToString("s"))+08:00",
      "---",
      "",
      "# $title",
      "",
      "原文链接：$url",
      "",
      $body
    ) -join "`n"

    Set-Content -LiteralPath $markdownPath -Encoding UTF8 -Value $markdown
    $manifestRows.Add(("ok,""{0}"",""{1}"",""{2}"",""{3}"",""""" -f $url, ($title -replace '"', '""'), $markdownPath, $publishedAt))
  } catch {
    $errorMessage = $_.Exception.Message -replace '"', '""'
    Write-Output "[$index/$($urls.Count)] failed $url :: $errorMessage"
    $manifestRows.Add(("failed,""{0}"","""","""","""",""{1}""" -f $url, $errorMessage))
  }

  if ($DelayMs -gt 0) {
    Start-Sleep -Milliseconds $DelayMs
  }
}

$manifestPath = Join-Path $OutputDir "manifest.csv"
$manifestRows | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output "Done."
Write-Output "Markdown directory: $markdownDir"
Write-Output "Manifest: $manifestPath"
