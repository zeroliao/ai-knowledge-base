param(
  [string[]]$Urls = @(),
  [string]$UrlsFile,
  [string]$DatasetId = '6a3422493bf8f931e8a3f337',
  [string]$FastGptBase = 'https://kb.zero007.chat',
  [string]$Username = 'zero451',
  [string]$PasswordPlain,
  [switch]$Import,
  [switch]$SkipExisting,
  [switch]$Overwrite,
  [string]$OutDir = '',
  [string]$KnownCardsJsonl = ''
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$ScriptDir = Split-Path -Parent $PSCommandPath
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..\..\..')).Path
if (-not $OutDir) { $OutDir = Join-Path $RepoRoot 'artifacts\generated\github-project-card-importer\out' }
if (-not $KnownCardsJsonl) { $KnownCardsJsonl = Join-Path $RepoRoot 'artifacts\generated\awesome-llm-apps\project-cards-v2.jsonl' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$StopWords = @('ai','agent','agents','app','apps','with','chat','llm','local','cloud','openai','gemini','gpt','qwen','python','template','project','demo','example')
$FullWidthColon = [char]0xFF1A
function T([string]$Base64) { [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Base64)) }
$DefaultLabels = @(
  (T '6aG555uu5ZCN56ew'),
  (T '5YiG57G7'),
  (T '6aG555uu5a6a5L2N'),
  (T '6YCC5ZCI6ZyA5rGC'),
  (T '5LiN6YCC5ZCI6ZyA5rGC'),
  (T '5qC45b+D6IO95Yqb'),
  (T '5oqA5pyv5qCIL+aehA=='),
  (T '5p2l5rqQ6ZO+5o6l'),
  (T '5rqQ56CB6Lev5b6E'),
  (T '5piv5ZCm5aSW6YOo6aG555uu'),
  (T '57K+5YeG5YWz6ZSu6K+N'),
  (T '5paH5Lu257q/57Si')
)

function Clean-Text([string]$Value) {
  if ($null -eq $Value) { return '' }
  $Value = $Value -replace '<[^>]+>', ' '
  $Value = $Value -replace '[\p{Cs}\p{So}\p{Sk}\p{Cn}\p{Co}]', ' '
  $Value = $Value -replace '[^\p{L}\p{N}\s\-_/&().:+#]', ' '
  $Value = $Value -replace '\s+', ' '
  return $Value.Trim()
}

function Add-Unique($List, [string[]]$Items) {
  foreach ($Item in $Items) {
    $Clean = Clean-Text $Item
    if ($Clean -and -not $List.Contains($Clean)) { [void]$List.Add($Clean) }
  }
}

function Parse-GithubUrl([string]$Url) {
  $Uri = [Uri]$Url
  if ($Uri.Host -notmatch '(^|\.)github\.com$') { throw "Not a GitHub URL: $Url" }
  $Parts = $Uri.AbsolutePath.Trim('/').Split('/')
  if ($Parts.Count -lt 2) { throw "Invalid GitHub URL: $Url" }
  $Owner = $Parts[0]
  $Repo = $Parts[1]
  $Kind = ''
  $Branch = ''
  $SubPath = ''
  if ($Parts.Count -ge 5 -and ($Parts[2] -eq 'tree' -or $Parts[2] -eq 'blob')) {
    $Kind = $Parts[2]
    $Branch = $Parts[3]
    $SubPath = [string]::Join('/', $Parts[4..($Parts.Count - 1)])
  }
  return [pscustomobject]@{ owner=$Owner; repo=$Repo; kind=$Kind; branch=$Branch; subPath=$SubPath; inputUrl=$Url }
}

function Normalize-Key([string]$Value) {
  if (-not $Value) { return '' }
  return $Value.Trim().TrimEnd('/').ToLowerInvariant()
}
function Invoke-GithubJson([string]$Url, [switch]$AllowNull) {
  $Response = curl.exe -L -sS --retry 2 --connect-timeout 20 -H 'Accept: application/vnd.github+json' -H 'User-Agent: ai-knowledge-base-importer' $Url
  if (-not $Response) { if ($AllowNull) { return $null }; throw "Empty GitHub response: $Url" }
  $Json = $Response | ConvertFrom-Json
  if ($Json.message -and $AllowNull) { return $null }
  return $Json
}
function Invoke-RawText([string]$Url) {
  $Text = curl.exe -L -sS --retry 1 --connect-timeout 20 $Url
  if ($LASTEXITCODE -ne 0) { return '' }
  return [string]$Text
}


function Resolve-RepoFallback($Info) {
  foreach ($Branch in @($Info.branch, 'main', 'master')) {
    if (-not $Branch) { continue }
    $Readme = Try-Readme $Info $Branch
    if ($Readme) {
      return [pscustomobject]@{
        repo = [pscustomobject]@{ name=$Info.repo; description=''; default_branch=$Branch; topics=@() }
        branch = $Branch
        readme = $Readme
        paths = @('README.md')
      }
    }
  }
  return [pscustomobject]@{
    repo = [pscustomobject]@{ name=$Info.repo; description=''; default_branch=(if ($Info.branch) { $Info.branch } else { 'main' }); topics=@() }
    branch = if ($Info.branch) { $Info.branch } else { 'main' }
    readme = $null
    paths = @()
  }
}
function Try-Readme($Info, [string]$Branch) {
  $BasePath = if ($Info.subPath) { $Info.subPath.Trim('/') } else { '' }
  foreach ($Name in @('README.md','readme.md','README.MD','README')) {
    $Path = if ($BasePath) { "$BasePath/$Name" } else { $Name }
    $RawUrl = "https://raw.githubusercontent.com/$($Info.owner)/$($Info.repo)/$Branch/$Path"
    $Text = Invoke-RawText $RawUrl
    if ($Text -and $Text.Length -gt 40 -and $Text -notmatch '^404: Not Found') {
      return [pscustomobject]@{ text=$Text; path=$Path; url=$RawUrl }
    }
  }
  return $null
}

function Guess-Stack([string[]]$Paths, [string]$Text) {
  $Stack = New-Object System.Collections.Generic.List[string]
  if ($Paths -match 'requirements\.txt|\.py$|pyproject\.toml|uv\.lock') { Add-Unique $Stack @('Python') }
  if ($Paths -match 'streamlit|\.streamlit') { Add-Unique $Stack @('Streamlit') }
  if ($Paths -match 'package\.json|\.tsx$|\.ts$|next\.config|vite\.config' -or $Text -match '(?i)typescript|javascript|react|next\.js|nextjs') { Add-Unique $Stack @('TypeScript/JavaScript') }
  if ($Paths -match 'next\.config|(^|/)app/' -or $Text -match '(?i)next\.js|nextjs|vercel') { Add-Unique $Stack @('Next.js') }
  if ($Paths -match 'Dockerfile|docker-compose') { Add-Unique $Stack @('Docker') }
  if ($Text -match '(?i)crewai|crew ai') { Add-Unique $Stack @('CrewAI') }
  if ($Text -match '(?i)langchain') { Add-Unique $Stack @('LangChain') }
  if ($Text -match '(?i)llamaindex|llama index') { Add-Unique $Stack @('LlamaIndex') }
  if ($Text -match '(?i)autogen|ag2') { Add-Unique $Stack @('AutoGen/AG2') }
  if ($Text -match '(?i)mcp|model context protocol') { Add-Unique $Stack @('MCP') }
  if ($Text -match '(?i)rag|retrieval|embedding') { Add-Unique $Stack @('RAG') }
  return @($Stack)
}

function Infer-Signals([string]$Title, [string]$Description, [string]$Readme, [string]$Path, [string[]]$Topics) {
  $Text = "$Title $Description $Readme $Path $([string]::Join(' ', $Topics))".ToLowerInvariant()
  $Capabilities = New-Object System.Collections.Generic.List[string]
  $Fit = New-Object System.Collections.Generic.List[string]
  $NotFit = New-Object System.Collections.Generic.List[string]
  $Keywords = New-Object System.Collections.Generic.List[string]

  if ($Text -match 'nextchat|chatgptnextweb|chatgpt-next-web|chatgpt web|chat ui|chatbot ui|web ui|llm chat|chat client') {
    Add-Unique $Capabilities @((T 'TExNIOiBiuWkqee9kemhteeVjOmdog=='),(T '5aSa5qih5Z6L6IGK5aSp5a6i5oi356uv'),(T '6Ieq5omY566hIENoYXRHUFQg57G75bqU55So'),(T '5o+Q56S66K+N5LiO5a+56K+d566h55CG'))
    Add-Unique $Fit @((T '5pCt5bu656eB5pyJIENoYXRHUFQg572R6aG154mI'),(T '5p6E5bu65aSa5qih5Z6L6IGK5aSp5YmN56uv'),(T '57uZ55So5oi35o+Q5L6b5Y+v55u05o6l5L2/55So55qEIEFJIOWvueivneWFpeWPow=='),(T '6Ieq5omY566hIExMTSDogYrlpKnlrqLmiLfnq68='))
    Add-Unique $NotFit @((T '5LulIFJBRyDnn6Xor4blupPkuLrkuLvnmoTns7vnu58='),(T '5paH5qGj6Kej5p6Q5YWl5bqT5rWB5rC057q/'),(T 'Qkkg55yL5p2/'),(T '6K+t6Z+z55S16K+d5py65Zmo5Lq6'))
    Add-Unique $Keywords @((T 'Q2hhdEdQVCDnvZHpobXniYg='),'NextChat',(T 'QUkg6IGK5aSp55WM6Z2i'),(T '6IGK5aSp5YmN56uv'),(T 'TExNIOiBiuWkqeWuouaIt+errw=='),(T '6Ieq5omY566h6IGK5aSp5bqU55So'),(T '5aSa5qih5Z6L6IGK5aSp'))
  }
  if ($Text -match 'youtube|video') { Add-Unique $Capabilities @('YouTube/video ingestion','video summarization','video question answering'); Add-Unique $Fit @('summarize videos','chat with video content','extract tutorial steps or action items from videos'); Add-Unique $NotFit @('generic BI dashboards','non-video document QA'); Add-Unique $Keywords @('YouTube','video summary','video QA','video learning assistant') }
  if ($Text -match 'pdf|document') { Add-Unique $Capabilities @('document ingestion','document summary','document question answering'); Add-Unique $Fit @('chat with PDF or documents','summarize reports or papers','build a file QA assistant'); Add-Unique $NotFit @('video QA','real-time voice agent'); Add-Unique $Keywords @('PDF','document QA','file QA','paper summary') }
  if ($Text -match 'voice|audio|speech|dictation|tts|stt') { Add-Unique $Capabilities @('speech input and output','real-time voice interaction','voice assistant'); Add-Unique $Fit @('voice customer service','phone agent','real-time voice assistant'); Add-Unique $Keywords @('voice','STT','TTS','phone agent','voice assistant') }
  if ($Text -match 'rag|retrieval|vector|knowledge base|embedding') { Add-Unique $Capabilities @('retrieval augmented generation','semantic search','knowledge base QA'); Add-Unique $Fit @('build RAG knowledge base','document retrieval QA','multi-source knowledge assistant'); Add-Unique $Keywords @('RAG','semantic search','knowledge base QA','vector search') }
  if ($Text -match 'mcp|model context protocol') { Add-Unique $Capabilities @('MCP tool integration','external service integration','tool routing'); Add-Unique $Fit @('connect MCP tools','build tool-calling agents','route across multiple tools'); Add-Unique $Keywords @('MCP','tool calling','model context protocol') }
  if ($Text -match 'github|issue|pull request|repository') { Add-Unique $Capabilities @('GitHub repository interaction','repository analysis','Issue/PR automation'); Add-Unique $Fit @('analyze GitHub projects','automate Issues or PRs','build code repository assistant'); Add-Unique $Keywords @('GitHub','repository','Issue','PR','developer assistant') }
  if ($Text -match 'data analysis|analyst|dashboard|sql|database|chart|csv') { Add-Unique $Capabilities @('data analysis','database or spreadsheet query','chart and insight generation'); Add-Unique $Fit @('analyze CSV or tables','database QA','BI dashboard','data insight report'); Add-Unique $Keywords @('data analysis','BI','SQL','dashboard','data visualization') }
  if ($Text -match 'research|paper|arxiv') { Add-Unique $Capabilities @('research collection','research synthesis','report generation'); Add-Unique $Fit @('deep research','paper QA','automated research reports'); Add-Unique $Keywords @('research agent','paper QA','research report') }
  if ($Text -match 'browser|scraping|crawler|web automation') { Add-Unique $Capabilities @('web scraping','browser automation','web content extraction'); Add-Unique $Fit @('collect website data','automate browser tasks','extract website content'); Add-Unique $Keywords @('web scraping','crawler','browser automation') }

  if ($Capabilities.Count -eq 0) { Add-Unique $Capabilities @((T 'TExNIOW6lOeUqOaooeadvw=='),(T '5pm66IO95L2T5bel5L2c5rWB'),(T '5Y+v5LqM5qyh5byA5Y+R55qE56S65L6L6aG555uu')) }
  if ($Fit.Count -eq 0) { Add-Unique $Fit @("$Title $(T '57G75Ly85Yqf6IO955qE5byA5rqQ5qih5p2/')", (T '6ZyA6KaB5oyJ5Yqf6IO944CB6KGM5Lia44CB5Lqk5LqS5pa55byP5oiW5oqA5pyv5qCI6YCJ5oup5Y+v5Y+C6ICD6aG555uu')) }
  if ($NotFit.Count -eq 0) { Add-Unique $NotFit @((T '5LiO6aG555uu5ZCN56ew44CBUkVBRE1FIOWSjOaguOW/g+iDveWKm+aXoOWFs+eahOazm+WMlumcgOaxgg==')) }

  $NameWords = ($Title -replace '[^\p{L}\p{N}]+',' ').Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { $_.Length -gt 2 -and $StopWords -notcontains $_.ToLowerInvariant() }
  Add-Unique $Keywords @($NameWords)
  Add-Unique $Keywords @($Topics | Where-Object { $_ -and $StopWords -notcontains $_.ToLowerInvariant() })

  return @{ capabilities=@($Capabilities); fit=@($Fit); not_fit=@($NotFit); keywords=@($Keywords | Select-Object -Unique) }
}

function Get-LabelsFromKnownCards() {
  if (-not (Test-Path $KnownCardsJsonl)) { return $DefaultLabels }
  $Line = [System.IO.File]::ReadLines($KnownCardsJsonl, [System.Text.Encoding]::UTF8) | Select-Object -First 1
  if (-not $Line) { return $DefaultLabels }
  $Card = $Line | ConvertFrom-Json
  $Labels = @()
  foreach ($ContentLine in ([string]$Card.content -split "`r?`n")) {
    $AsciiIndex = $ContentLine.IndexOf(':')
    $WideIndex = $ContentLine.IndexOf($FullWidthColon)
    $Indexes = @($AsciiIndex, $WideIndex) | Where-Object { $_ -ge 0 } | Sort-Object
    if ($Indexes.Count -gt 0) { $Labels += $ContentLine.Substring(0, $Indexes[0]) }
  }
  if ($Labels.Count -ge 12) { return $Labels[0..11] }
  return $DefaultLabels
}

function Load-KnownCards() {
  $Map = @{}
  if (-not (Test-Path $KnownCardsJsonl)) { return $Map }
  foreach ($Line in [System.IO.File]::ReadLines($KnownCardsJsonl, [System.Text.Encoding]::UTF8)) {
    if (-not $Line.Trim()) { continue }
    try {
      $Card = $Line | ConvertFrom-Json
      if ($Card.source_url) { $Map[(Normalize-Key ([string]$Card.source_url))] = $Card }
      if ($Card.source_path) { $Map[(Normalize-Key ([string]$Card.source_path))] = $Card }
    } catch {}
  }
  return $Map
}


function Prune-Signals($Signals) {
  if ($Signals.keywords -contains (T 'QUkg6IGK5aSp55WM6Z2i') -or $Signals.keywords -contains 'NextChat') {
    $KeepKeywords = @((T 'Q2hhdEdQVCDnvZHpobXniYg='),'NextChat',(T 'QUkg6IGK5aSp55WM6Z2i'),(T '6IGK5aSp5YmN56uv'),(T 'TExNIOiBiuWkqeWuouaIt+errw=='),(T '6Ieq5omY566h6IGK5aSp5bqU55So'),(T '5aSa5qih5Z6L6IGK5aSp'))
    $KeepCaps = @((T 'TExNIOiBiuWkqee9kemhteeVjOmdog=='),(T '5aSa5qih5Z6L6IGK5aSp5a6i5oi356uv'),(T '6Ieq5omY566hIENoYXRHUFQg57G75bqU55So'),(T '5o+Q56S66K+N5LiO5a+56K+d566h55CG'))
    $KeepFit = @((T '5pCt5bu656eB5pyJIENoYXRHUFQg572R6aG154mI'),(T '5p6E5bu65aSa5qih5Z6L6IGK5aSp5YmN56uv'),(T '57uZ55So5oi35o+Q5L6b5Y+v55u05o6l5L2/55So55qEIEFJIOWvueivneWFpeWPow=='),(T '6Ieq5omY566hIExMTSDogYrlpKnlrqLmiLfnq68='))
    $KeepNotFit = @((T '5LulIFJBRyDnn6Xor4blupPkuLrkuLvnmoTns7vnu58='),(T '5paH5qGj6Kej5p6Q5YWl5bqT5rWB5rC057q/'),(T 'Qkkg55yL5p2/'),(T '6K+t6Z+z55S16K+d5py65Zmo5Lq6'))
    return @{ capabilities=$KeepCaps; fit=$KeepFit; not_fit=$KeepNotFit; keywords=$KeepKeywords }
  }
  return $Signals
}
function Sha256Hex([string]$Value) {
  $Sha = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($Sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Value))).Replace('-','').ToLowerInvariant() }
  finally { $Sha.Dispose() }
}

function PostJson($CookieFile, [string]$Url, $Body) {
  $Temp = New-TemporaryFile
  try {
    [System.IO.File]::WriteAllText($Temp, ($Body | ConvertTo-Json -Compress -Depth 20), (New-Object System.Text.UTF8Encoding($false)))
    $Response = curl.exe -sS --connect-timeout 20 --retry 2 -b $CookieFile -c $CookieFile -H 'Content-Type: application/json' -X POST $Url --data-binary "@$Temp"
    if (-not $Response) { throw "Empty response from $Url" }
    return ($Response | ConvertFrom-Json)
  } finally {
    Remove-Item $Temp -Force -ErrorAction SilentlyContinue
  }
}
function GetJson($CookieFile, [string]$Url) {
  $Response = curl.exe -sS --connect-timeout 20 --retry 2 -b $CookieFile -c $CookieFile $Url
  if (-not $Response) { throw "Empty response from $Url" }
  return ($Response | ConvertFrom-Json)
}
function GetExistingSourceUrls($CookieFile, [string]$Base, [string]$CurrentDatasetId) {
  $Existing = @{}
  foreach ($PageNum in 1..20) {
    try {
      $Url = "$Base/api/core/dataset/collection/list?datasetId=$CurrentDatasetId&pageNum=$PageNum&pageSize=100"
      $Result = GetJson $CookieFile $Url
      $List = @()
      if ($Result.data.list) { $List = @($Result.data.list) }
      elseif ($Result.data) { $List = @($Result.data) }
      if ($List.Count -eq 0) { break }
      foreach ($Item in $List) {
        $SourceUrl = $null
        if ($Item.metadata -and $Item.metadata.sourceUrl) { $SourceUrl = [string]$Item.metadata.sourceUrl }
        elseif ($Item.rawLink) { $SourceUrl = [string]$Item.rawLink }
        $SourceKey = Normalize-Key $SourceUrl
        if ($SourceKey -and -not $Existing.ContainsKey($SourceKey)) { $Existing[$SourceKey] = $true }
      }
      if ($List.Count -lt 100) { break }
    } catch {
      Write-Output "warn_existing_lookup_failed=$($_.Exception.Message)"
      break
    }
  }
  return $Existing
}

$Labels = Get-LabelsFromKnownCards
$KnownCards = Load-KnownCards
$AllUrls = New-Object System.Collections.Generic.List[string]
Add-Unique $AllUrls $Urls
if ($UrlsFile) {
  $FileUrls = [System.IO.File]::ReadAllLines($UrlsFile, [System.Text.Encoding]::UTF8) | Where-Object { $_ -and $_.Trim() -and -not $_.Trim().StartsWith('#') }
  Add-Unique $AllUrls $FileUrls
}
if ($AllUrls.Count -eq 0) { throw 'No GitHub URLs provided. Use -Urls or -UrlsFile.' }

$Cards = New-Object System.Collections.Generic.List[object]
foreach ($Url in $AllUrls) {
  $Info = Parse-GithubUrl $Url
  $KnownPathKey = Normalize-Key $Info.subPath
  $KnownInputKey = Normalize-Key $Url
  if ($KnownInputKey -and $KnownCards.ContainsKey($KnownInputKey)) { $KnownKey = $KnownInputKey }
  else { $KnownKey = '' }
  if ($KnownPathKey -and $KnownCards.ContainsKey($KnownPathKey)) { $KnownKey = $KnownPathKey }

  if ($KnownKey) {
    $Known = $KnownCards[$KnownKey]
    $Branch = if ($Info.branch) { $Info.branch } else { 'main' }
    $SourceUrl = [string]$Known.source_url
    $Cards.Add([pscustomobject]@{
      title=$Known.title
      category=$Known.category
      source_url=$Known.source_url
      source_path=$Known.source_path
      owner=$Info.owner
      repo=$Info.repo
      branch=$Branch
      stack=@($Known.stack)
      keywords=@($Known.keywords)
      content=[string]$Known.content
      reused_known_card=$true
    })
    continue
  }

  $Repo = Invoke-GithubJson "https://api.github.com/repos/$($Info.owner)/$($Info.repo)" -AllowNull
  if ($Repo -and $Repo.name) {
    $Branch = if ($Info.branch) { $Info.branch } elseif ($Repo.default_branch) { $Repo.default_branch } else { 'main' }
    $SourceUrl = if ($Info.subPath) { "https://github.com/$($Info.owner)/$($Info.repo)/tree/$Branch/$($Info.subPath)" } else { "https://github.com/$($Info.owner)/$($Info.repo)" }
    $Tree = Invoke-GithubJson "https://api.github.com/repos/$($Info.owner)/$($Info.repo)/git/trees/$Branch?recursive=1" -AllowNull
    $Prefix = if ($Info.subPath) { $Info.subPath.Trim('/') + '/' } else { '' }
    $Paths = if ($Tree -and $Tree.tree) { @($Tree.tree | ForEach-Object { $_.path } | Where-Object { $_ -and (-not $Prefix -or $_ -eq $Info.subPath -or $_.StartsWith($Prefix)) }) } else { @() }
    $Readme = Try-Readme $Info $Branch
  } else {
    Write-Output "warn_github_api_unavailable_fallback $Url"
    $Fallback = Resolve-RepoFallback $Info
    $Repo = $Fallback.repo
    $Branch = $Fallback.branch
    $SourceUrl = if ($Info.subPath) { "https://github.com/$($Info.owner)/$($Info.repo)/tree/$Branch/$($Info.subPath)" } else { "https://github.com/$($Info.owner)/$($Info.repo)" }
    $Paths = @($Fallback.paths)
    $Readme = $Fallback.readme
  }

  $KnownKey = Normalize-Key $SourceUrl
  $ReadmeText = if ($Readme) { Clean-Text (($Readme.text -split "`r?`n" | Select-Object -First 120) -join "`n") } else { '' }
  $Title = if ($Info.subPath) { Clean-Text (Split-Path $Info.subPath -Leaf) } else { Clean-Text $Repo.name }
  if (-not $Title) { $Title = Clean-Text $Info.repo }
  $Description = Clean-Text $Repo.description
  $Topics = @($Repo.topics)
  $Signals = Prune-Signals (Infer-Signals $Title $Description $ReadmeText $Info.subPath $Topics)
  $Stack = Guess-Stack $Paths "$Title $Description $ReadmeText $($Info.subPath)"
  if ($Signals.keywords -contains (T 'QUkg6IGK5aSp55WM6Z2i') -or $Signals.keywords -contains 'NextChat') { $Stack = @($Stack | Where-Object { $_ -ne 'MCP' -and $_ -ne 'RAG' }); if (-not ($Stack -contains 'TypeScript/JavaScript')) { $Stack += 'TypeScript/JavaScript' }; if (-not ($Stack -contains 'Next.js')) { $Stack += 'Next.js' } }
  $Category = if ($Signals.keywords -contains (T 'QUkg6IGK5aSp55WM6Z2i') -or $Signals.keywords -contains 'NextChat' -or $Title -match '(?i)nextchat|chatgpt.*web|chat.*ui') { (T 'TExNIOiBiuWkqeWJjeerrw==') } elseif ($Signals.keywords -contains 'RAG') { 'RAG' } elseif ($Signals.keywords -contains 'MCP') { 'MCP AI Agents' } elseif ($Title -match '(?i)youtube|pdf|chat_with|chat with') { 'Chat with X Tutorials' } else { 'Imported GitHub Projects' }
  $FirstFit = @($Signals.fit | Select-Object -First 1)[0]
  $TopCaps = [string]::Join((T '44CB'), @($Signals.capabilities | Select-Object -First 3))
  $Position = "$(T '55So5LqO')$FirstFit$(T '44CC5qC45b+D5YWz5rOo77ya')$TopCaps$(T '44CC')"
  $FileClues = @($Paths | ForEach-Object { Clean-Text (Split-Path $_ -Leaf) } | Where-Object { $_ } | Select-Object -Unique -First 12)
  $StackText = if ($Stack) { [string]::Join(', ', @($Stack)) } else { '' }
  $ContentLines = @(
    "$($Labels[0])${FullWidthColon}$Title",
    "$($Labels[1])${FullWidthColon}$Category",
    "$($Labels[2])${FullWidthColon}$Position",
    "$($Labels[3])${FullWidthColon}$([string]::Join('; ', @($Signals.fit)))",
    "$($Labels[4])${FullWidthColon}$([string]::Join('; ', @($Signals.not_fit)))",
    "$($Labels[5])${FullWidthColon}$([string]::Join(', ', @($Signals.capabilities)))",
    "$($Labels[6])${FullWidthColon}$StackText",
    "$($Labels[7])${FullWidthColon}$SourceUrl",
    "$($Labels[8])${FullWidthColon}$($Info.subPath)",
    "$($Labels[9])${FullWidthColon}True",
    "$($Labels[10])${FullWidthColon}$([string]::Join(', ', @($Signals.keywords)))",
    "$($Labels[11])${FullWidthColon}$([string]::Join(', ', $FileClues))"
  )
  $Cards.Add([pscustomobject]@{
    title=$Title
    category=$Category
    source_url=$SourceUrl
    source_path=$Info.subPath
    owner=$Info.owner
    repo=$Info.repo
    branch=$Branch
    stack=@($Stack)
    keywords=@($Signals.keywords)
    content=($ContentLines -join "`n")
    reused_known_card=$false
  })
}

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Jsonl = Join-Path $OutDir "github-project-cards-$Stamp.jsonl"
$Markdown = Join-Path $OutDir "github-project-cards-$Stamp.md"
[System.IO.File]::WriteAllLines($Jsonl, @($Cards | ForEach-Object { $_ | ConvertTo-Json -Compress -Depth 8 }), $utf8NoBom)
[System.IO.File]::WriteAllLines($Markdown, @($Cards | ForEach-Object { "# $($_.title)`n`n$($_.content)`n" }), $utf8NoBom)
Write-Output "generated=$($Cards.Count) jsonl=$Jsonl md=$Markdown"
$Cards | Select-Object title,category,reused_known_card,source_url | Format-Table -AutoSize

if ($Import) {
  if (-not $PasswordPlain) { throw 'PasswordPlain is required when -Import is used.' }
  if ($Overwrite) { Write-Output 'warn_overwrite_delete_not_supported; importing without deletion. Use -SkipExisting to avoid duplicates.' }
  $CookieFile = Join-Path $env:TEMP ('fastgpt-github-import-' + [guid]::NewGuid().ToString('N') + '.txt')
  try {
    $PreLogin = curl.exe -sS --connect-timeout 20 --retry 2 -b $CookieFile -c $CookieFile "$FastGptBase/api/support/user/account/preLogin?username=$Username" | ConvertFrom-Json
    $Login = PostJson $CookieFile "$FastGptBase/api/support/user/account/loginByPassword" @{ username=$Username; password=(Sha256Hex $PasswordPlain); code=$PreLogin.data.code; language='zh-CN' }
    if ($Login.code -ne 200) { throw 'FastGPT login failed' }
    $Existing = @{}
    if ($SkipExisting) { $Existing = GetExistingSourceUrls $CookieFile $FastGptBase $DatasetId }
    $Ok = 0
    $Skip = 0
    $Fail = 0
    foreach ($Card in $Cards) {
      $CardSourceKey = Normalize-Key $Card.source_url
      if ($SkipExisting -and $Existing.ContainsKey($CardSourceKey)) {
        $Skip++
        Write-Output "skip_existing $($Card.title) $($Card.source_url)"
        continue
      }
      $SafeName = ($Card.title -replace '[\\/:*?"<>|]', ' ').Trim()
      if ($SafeName.Length -gt 80) { $SafeName = $SafeName.Substring(0,80).Trim() }
      $Body = @{
        datasetId = $DatasetId
        name = $SafeName
        text = [string]$Card.content
        trainingType = 'chunk'
        chunkSize = 1000
        chunkSplitter = "`n"
        indexSize = 384
        tags = @($Card.category)
        metadata = @{
          source = 'github'
          owner = $Card.owner
          repo = $Card.repo
          sourceUrl = $Card.source_url
          sourcePath = $Card.source_path
          card_version = 'v2-high-signal'
          imported_at = (Get-Date).ToString('o')
        }
      }
      try {
        $Result = PostJson $CookieFile "$FastGptBase/api/core/dataset/collection/create/text" $Body
        if ($Result.code -eq 200) { $Ok++ }
        else { $Fail++; Write-Output "fail $SafeName $($Result | ConvertTo-Json -Compress -Depth 5)" }
      } catch {
        $Fail++
        Write-Output "fail $SafeName $($_.Exception.Message)"
      }
    }
    Write-Output "import_done ok=$Ok skip=$Skip fail=$Fail datasetId=$DatasetId"
  } finally {
    Remove-Item $CookieFile -Force -ErrorAction SilentlyContinue
  }
}
