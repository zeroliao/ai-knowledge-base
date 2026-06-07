$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$opsRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$fixtureDir = Join-Path $opsRoot "tests\fixtures"
New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null

function ConvertFrom-Base64Utf8 {
  param([string]$Value)
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Value))
}

function Write-Utf8File {
  param(
    [string]$Path,
    [string]$Content
  )
  Set-Content -LiteralPath $Path -Encoding UTF8 -Value $Content
}

$overview = ConvertFrom-Base64Utf8 "IyBBSSDnp4HmnInnn6Xor4blupMgVjEg5qaC6KeICgpWMSDnmoTnm67moIfmmK/pg6jnvbLkuIDkuKrkuKrkurrniYggTm90ZWJvb2tMTSDpo47moLznmoTnp4HmnInnn6Xor4blupPjgILns7vnu5/kv53lrZjljp/lp4votYTmlpnvvIzmlK/mjIEgUERG44CBRE9DWOOAgVRYVOOAgU1hcmtkb3duIOWSjOaJi+WKqOaWh+acrOWFpeW6k++8jOW5tumAmui/hyBlbWJlZGRpbmcg5qOA57Si44CB5YWz6ZSu6K+N5qOA57Si5ZKM5re35ZCI5qOA57Si5a6M5oiQIEFJIOmXruetlOOAggoK57O757uf5b+F6aG75bGV56S65Y+v55CG6Kej5p2l5rqQ77yM5p2l5rqQ6ZyA6KaB6IO95aSf6L+95rqv5Yiw5Y6f5aeL5paH5Lu244CB5Y6f5Zu+5oiW5Y6f5aeL6ZO+5o6l44CC5YiG57G75LiN6aKE5Yid5aeL5YyW77yM5Y+q5L+d55WZ5YWc5bqV5YiG57G777ya5b6F5YiG57G7IC8g5Li05pe25pS26ZuG44CCCgrliqjmgIHliIbnsbvmtYHnqIvmmK/lnKjlvZXlhaXml7bmj5Dlj5bmoIfpopjjgIHmkZjopoHjgIHlhbPplK7or43lkozlt7LmnInliIbnsbvvvIzlho3nlLEgQUkg5o6o6I2Q5L2/55So5bey5pyJ5YiG57G744CB5paw5aKe5YiG57G75oiW6L+b5YWl5b6F5YiG57G777yM55So5oi356Gu6K6k5ZCO5YWl5bqT44CC"
$notes = ConvertFrom-Base64Utf8 "TUNQIOS4jiBBZ2VudCDotYTmlpnnrJTorrAKCkNvZGV4IOaOpSBNQ1Ag5pe277yM5bqU5LyY5YWI5L2/55So5a6Y5pa5IE1DUCDmiJbpobnnm67lt7Lnu4/phY3nva7nmoQgTUNQ44CCRmlsZXN5c3RlbSBNQ1Ag5Y+q6IO96K6/6Zeu5oyH5a6aIHN0b3JhZ2Ug55uu5b2V77yM6YG/5YWN6K+75Y+W5peg5YWz6Lev5b6E44CCRmV0Y2ggTUNQIOWPr+eUqOS6juaZrumAmumdmeaAgee9kemhteaKk+WPlu+8jOS9huWkjeadgiBKUyDnvZHpobXmlL7liLAgVjIg5YaN6K+E5LywIEZpcmVjcmF3bOOAgUJyb3dzZXJiYXNlIOaIliBBcGlmeeOAggoKVjEg5LiN6L+Q6KGM5pys5Zyw5aSn5qih5Z6L44CB5pys5ZywIGVtYmVkZGluZyDmqKHlnovjgIFXaGlzcGVy44CBTWlsdnVz44CB5rWP6KeI5Zmo6ZuG576k5ZKM5aSN5p2CIEFnZW50IOaymeebkuOAgg=="
$questions = ConvertFrom-Base64Utf8 "IyDpqozmlLbpl67popgKCjEuIFYxIOW/hemhu+aUr+aMgeWTquS6m+i1hOaWmeexu+Wei+WFpeW6k++8nwoyLiDkuLrku4DkuYggVjEg5LiN5bu66K6u5L2/55SoIE1pbHZ1c++8nwozLiDliqjmgIHliIbnsbvmjqjojZDnmoTnoa7orqTmtYHnqIvmmK/ku4DkuYjvvJ8KNC4g5p2l5rqQ5byV55So5Li65LuA5LmI5LiN6IO95Y+q5pi+56S6IGNodW5rIGlk77yfCjUuIENvZGV4IOaOpSBNQ1Ag5pe277yMRmlsZXN5c3RlbSBNQ1Ag5pyJ5LuA5LmI6K6/6Zeu6ZmQ5Yi277yfCjYuIOWmguaenOeUqOaIt+mXruKAnENvZGV4IOaAjuS5iOaOpSBNQ1DvvJ/igJ3vvIzlupTor6XkvJjlhYjmo4DntKLlk6rkupvnsbvlnovnmoTotYTmlpnvvJ8="
$docxText = ConvertFrom-Base64Utf8 "6YOo572y6aqM5pS25riF5Y2VCgrln7rnoYDmnI3liqHpnIDopoHpqozor4EgRmFzdEdQVOOAgU1vbmdvRELjgIFQb3N0Z3JlU1FMICsgcGd2ZWN0b3LjgIFSZWRpc+OAgUFJUHJveHkg5ZKMIHN1YjJhcGkg5Z2H5q2j5bi46L+Q6KGM44CC5qih5Z6L6ZyA6KaB5YiG5Yir6aqM6K+BIENoYXQg5qih5Z6L5ZKMIEVtYmVkZGluZyDmqKHlnovjgIIKCui1hOaWmeWFpeW6k+mcgOimgemqjOivgSBQREbjgIFET0NY44CBVFhU44CBTWFya2Rvd24g5ZKM5omL5Yqo5paH5pys44CC6Zeu562U6ZyA6KaB6aqM6K+B5Y2V55+l6K+G5bqT44CB5aSa55+l6K+G5bqT5ZKM5YWo5bGA6Zeu562U77yM5bm25qOA5p+l5Zue562U5Lit55qE5p2l5rqQ5piv5ZCm5Y+v55CG6Kej44CC"
$pdfText = ConvertFrom-Base64Utf8 "5byV55So562W55Wl6K+05piOCgrnn6Xor4blupPlm57nrZTlv4Xpobvln7rkuo7otYTmlpnlhoXlrrnvvIzlubblsZXnpLrlj6/nkIbop6PmnaXmupDlkI3np7DjgILmnaXmupDnpLrkvovljIXmi6wgQWdlbnTorr7orqHmjIfljZcucGRm44CBT3BlbkFJIOWumOaWueaWh+aho++8mlJlc3BvbnNlcyBBUEnjgIFBZ2VudCDmnrbmnoTlm74ucG5n44CCCgrnpoHmraLlj6rmmL7npLogY2h1bmtfMTIzIOi/meexu+S4jeWPr+eQhuino+W8leeUqOOAguavj+S4quadpea6kOW/hemhu+iDveaJk+W8gOWOn+aWh+OAgeWOn+WbvuaIluWOn+WniyBVUkzjgII="

Write-Utf8File -Path "$fixtureDir\ai-knowledge-overview.md" -Content $overview
Write-Utf8File -Path "$fixtureDir\mcp-agent-notes.txt" -Content $notes
Write-Utf8File -Path "$fixtureDir\acceptance-questions.md" -Content $questions

$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false

  $doc = $word.Documents.Add()
  $word.Selection.TypeText($docxText)
  $doc.SaveAs([ref]((Resolve-Path $fixtureDir).Path + "\deployment-checklist.docx"), [ref]16)
  $doc.Close()
  Write-Output "Generated deployment-checklist.docx via Word COM."

  $pdfDoc = $word.Documents.Add()
  $word.Selection.TypeText($pdfText)
  $pdfDoc.SaveAs([ref]((Resolve-Path $fixtureDir).Path + "\citation-policy.pdf"), [ref]17)
  $pdfDoc.Close()
  Write-Output "Generated citation-policy.pdf via Word COM."
} catch {
  Write-Utf8File -Path "$fixtureDir\deployment-checklist.docx.txt" -Content $docxText
  Write-Utf8File -Path "$fixtureDir\citation-policy.pdf.txt" -Content $pdfText
  Write-Output "Word COM unavailable. Generated DOCX/PDF text fallbacks."
} finally {
  if ($word) { $word.Quit() }
}

Write-Output "Fixtures generated in $fixtureDir"
