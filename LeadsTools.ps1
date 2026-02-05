# ===== Lead 管理ユーティリティ（安定版） =====

# グローバル文脈（なければ作る／壊れてたら作り直す）
if (-not $global:LeadsCtx -or
    -not ($global:LeadsCtx.PSObject.Properties.Name -contains 'BaseUrl') -or
    -not ($global:LeadsCtx.PSObject.Properties.Name -contains 'Token')) {
  $global:LeadsCtx = [pscustomobject]@{
    BaseUrl = $null
    Token   = $null
  }
}

function Set-LeadsContext {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$BaseUrl,
    [Parameter(Mandatory=$true)][string]$AdminToken
  )
  $BaseUrl    = $BaseUrl.Trim()
  $AdminToken = $AdminToken.Trim()

  # 妥当性チェック
  [void]([System.Uri]$BaseUrl)
  if (-not ($AdminToken -match '^[A-Fa-f0-9]{64}$')) {
    throw "AdminToken は 64 桁 hex が必要だよ（今: '$AdminToken'）。"
  }

  # 器を保証
  if (-not $global:LeadsCtx -or
      -not ($global:LeadsCtx.PSObject.Properties.Name -contains 'BaseUrl') -or
      -not ($global:LeadsCtx.PSObject.Properties.Name -contains 'Token')) {
    $global:LeadsCtx = [pscustomobject]@{ BaseUrl=$null; Token=$null }
  }

  $global:LeadsCtx.BaseUrl = $BaseUrl
  $global:LeadsCtx.Token   = $AdminToken

  Write-Host "✅ Context set" -ForegroundColor Green
  "BaseUrl = $($global:LeadsCtx.BaseUrl)"
  if ($global:LeadsCtx.Token) {
    "Token   = $($global:LeadsCtx.Token.Substring(0,6))...(64hex)"
  } else {
    "Token   = (not set)"
  }
}

function Get-LeadsContext { $global:LeadsCtx }

function Get-DiagLeads {
  [CmdletBinding()]
  param(
    [string]$BaseUrl    = $global:LeadsCtx.BaseUrl,
    [string]$AdminToken = $global:LeadsCtx.Token
  )
  if ([string]::IsNullOrWhiteSpace($BaseUrl))    { throw "BaseUrl が未設定。Set-LeadsContext を先に実行してね。" }
  if ([string]::IsNullOrWhiteSpace($AdminToken)) { throw "AdminToken が未設定。Set-LeadsContext を先に実行してね。" }

  $uri = '{0}/diag-leads' -f $BaseUrl
  [void]([System.Uri]$uri)
  Invoke-RestMethod -Uri $uri -Method GET -Headers @{ Authorization = "Bearer $AdminToken" }
}

function Filter-Leads {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)]$LeadsJson,
    [string]$Search,
    [string]$Channel,
    [Nullable[datetime]]$Since,
    [Nullable[datetime]]$Until,
    [int]$Top = 0
  )
  $items = $LeadsJson.items

  if ($Search) {
    $s = $Search.ToLower()
    $items = $items | Where-Object {
      ($_.name   -as [string]).ToLower().Contains($s) -or
      ($_.email  -as [string]).ToLower().Contains($s) -or
      ($_.note   -as [string]).ToLower().Contains($s)
    }
  }
  if ($Channel) { $items = $items | Where-Object { $_.channel -eq $Channel } }
  if ($Since)   { $sinceMs = [int64]([DateTimeOffset]$Since).ToUnixTimeMilliseconds(); $items = $items | Where-Object { $_.created_at -ge $sinceMs } }
  if ($Until)   { $untilMs = [int64]([DateTimeOffset]$Until).ToUnixTimeMilliseconds(); $items = $items | Where-Object { $_.created_at -le $untilMs } }

  $items = $items | Sort-Object created_at -Descending
  if ($Top -gt 0) { $items = $items | Select-Object -First $Top }

  [pscustomobject]@{
    ok    = $LeadsJson.ok
    items = @($items)
    total = @($items).Count
  }
}

function Export-LeadsCsv {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)]$LeadsJson,
    [Parameter(Mandatory=$true)][string]$Path
  )
  $rows = $LeadsJson.items | ForEach-Object {
    [pscustomobject]@{
      id        = $_.id
      tenant    = $_.tenant
      name      = $_.name
      email     = $_.email
      channel   = $_.channel
      note      = $_.note
      createdAt = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$_.created_at).LocalDateTime
    }
  }
  $rows | Export-Csv -Path $Path -NoTypeInformation -Encoding UTF8
  Write-Host "✅ Exported $($rows.Count) rows to $Path" -ForegroundColor Green
}

function Show-DiagLeads {
  [CmdletBinding()]
  param(
    [int]$Top = 20,
    [switch]$AsArray
  )
  $result = Get-DiagLeads
  $items = $result.items | Sort-Object created_at -Descending
  if ($Top -gt 0) { $items = $items | Select-Object -First $Top }

  if ($Raw) { return $items }

  $items |
    Select-Object name,email,channel,
      @{n='createdAt';e={[DateTimeOffset]::FromUnixTimeMilliseconds([int64]$_.created_at).LocalDateTime}} |
    Format-Table -AutoSize | Out-Host

  Write-Host ("(showing {0}/{1})" -f ($items.Count), ($result.items.Count)) -ForegroundColor DarkGray
  return $raw
}
# ===== ここまで =====

