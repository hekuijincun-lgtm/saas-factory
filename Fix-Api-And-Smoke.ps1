<# =========================
  Fix-Api-And-Smoke.ps1  (clean build, no inner here-strings)
========================= #>

param(
  [string]$Repo      = "$HOME\repo\line-booking",
  [string]$Wrangler  = "4.46.0",
  [string]$Stg       = "https://saas-api-staging-v4.hekuijincun.workers.dev",
  [string]$Prd       = "https://saas-api-v4.hekuijincun.workers.dev",
  [switch]$DryRun,
  [switch]$SkipSmoke
)

$ErrorActionPreference = 'Stop'
$Api   = Join-Path $Repo "api"
$Ts    = Join-Path $Api "src\index.ts"
$Toml  = Join-Path $Api "wrangler.toml"

function Assert-RepoPaths {
  if (-not (Test-Path $Api))  { throw "not found: $Api" }
  if (-not (Test-Path $Ts))   { throw "not found: $Ts" }
  if (-not (Test-Path $Toml)) { throw "not found: $Toml" }
  if (-not (Test-Path (Join-Path $Repo ".git"))) { throw "not a git repo: $Repo" }
}

function New-Backup {
  param([string]$Path)
  $bak = "$Path.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item $Path $bak
  Write-Host "🗄️  backup: $bak" -ForegroundColor DarkCyan
}

function Install-BacktickPrecommitHook {
  param([string]$Repo)
  $HookDir = Join-Path $Repo ".git\hooks"
  if (-not (Test-Path $HookDir)) { throw "Not a git repo (no .git/hooks): $Repo" }
  $HookSh   = Join-Path $HookDir "pre-commit"
  $HookPs1  = Join-Path $HookDir "pre-commit.ps1"
  $HookCmd  = Join-Path $HookDir "pre-commit.cmd"

  $ps1 = @(
    '$ErrorActionPreference = "Stop"'
    'try {'
    '  Push-Location (git rev-parse --show-toplevel)'
    '  $changed = @()'
    '  try { $changed = git diff --staged --name-only 2>$null } catch {}'
    '  if (-not $changed) { exit 0 }'
    "  $changed = $changed | Where-Object { $_ -match '\.(ts|tsx|js|mjs|cjs)$' }"
    '  $offenders = New-Object System.Collections.Generic.List[string]'
    '  foreach($f in $changed){'
    '    if(-not (Test-Path $f)){ continue }'
    '    $lines = Get-Content $f -Encoding UTF8'
    '    for($i=0;$i -lt $lines.Count;$i++){'
    "      if($lines[$i] -match '^\s*`{3,}' -or $lines[$i] -match '^\s*`(?!`)'){"
    '        $offenders.Add("{0}:{1}" -f $f, ($i+1))'
    '      }'
    '    }'
    '  }'
    '  if($offenders.Count -gt 0){'
    '    Write-Host "❌ Backtick fence / stray backtick detected:" -ForegroundColor Red'
    '    $offenders | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }'
    '    exit 1'
    '  }'
    '} finally { Pop-Location }'
  ) -join "`r`n"
  Set-Content -Path $HookPs1 -Value $ps1 -Encoding UTF8

  $sh = @(
    '#!/usr/bin/env sh'
    'exec pwsh -NoLogo -NoProfile -NonInteractive -File "$(dirname "$0")/pre-commit.ps1"'
  ) -join "`n"
  Set-Content -Path $HookSh -Value $sh -NoNewline -Encoding UTF8

  $cmd = '@echo off\r\npwsh -NoLogo -NoProfile -NonInteractive -File "%~dp0pre-commit.ps1"%*'
  Set-Content -Path $HookCmd -Value $cmd -NoNewline -Encoding ASCII

  try { git -C $Repo update-index --chmod=+x ".git/hooks/pre-commit" | Out-Null } catch {}
  Write-Host "✅ pre-commit hook installed (sh + ps1 + cmd)" -ForegroundColor Green
}

function Get-ResolverText {
  ($arr = @(
    '// __ENV_RESOLVER_START__'
    'const __resolveEnv = (c: any) => {'
    '  const host = c.req?.raw?.headers?.get?.("host") || "";'
    '  const v = (c.env?.ENV_NAME ?? c.env?.EnvName ?? c.env?.env_name);'
    '  return v ?? (host.includes("-staging-") ? "staging" : "production");'
    '};'
    '// __ENV_RESOLVER_END__'
  )) -join "`r`n"
}

function Get-RoutesText {
  ($arr = @(
    '// __ENV_ROUTES_START__'
    'app.get("/__env", (c: any) => {'
    '  const runtimeEnv = __resolveEnv(c);'
    '  const keys = Object.keys(c.env || {}).sort();'
    '  const peek: Record<string,string> = {};'
    '  for (const k of keys) if (typeof (c.env as any)[k] === "string") peek[k] = (c.env as any)[k];'
    '  return c.json({ ok: true, runtimeEnv, ENV_NAME: (c.env as any)?.ENV_NAME ?? null, keys, peek });'
    '});'
    ''
    'app.get("/__health", async (c: any) => {'
    '  const env = __resolveEnv(c);'
    '  const checks: Record<string, { ok: boolean; detail?: string }> = {};'
    ''
    '  try {'
    '    const key = `__health:${Date.now()}`;'
    '    await c.env.LINE_BOOKING.put(key, "1", { expirationTtl: 60 });'
    '    const v = await c.env.LINE_BOOKING.get(key);'
    '    checks.kv = { ok: v === "1" };'
    '  } catch (e:any) {'
    '    checks.kv = { ok: false, detail: String(e?.message ?? e) };'
    '  }'
    ''
    '  try {'
    '    const id = c.env.SLOT_LOCK.idFromName("probe");'
    '    const stub = c.env.SLOT_LOCK.get(id);'
    '    const r = await stub.fetch("https://do/probe");'
    '    checks.do = { ok: r.ok };'
    '  } catch (e:any) {'
    '    checks.do = { ok: false, detail: String(e?.message ?? e) };'
    '  }'
    ''
    '  const ok = Object.values(checks).every(x => x.ok);'
    '  return c.json({ ok, ts: Date.now(), env, checks });'
    '});'
    '// __ENV_ROUTES_END__'
  )) -join "`r`n"
}

function Patch-IndexTs-EnvAndHealth {
  param([string]$Ts)
  $src = Get-Content $Ts -Raw -Encoding UTF8

  # clean
  $src = [regex]::Replace($src,'//\s*__ENV_RESOLVER_START__.*?//\s*__ENV_RESOLVER_END__','', 'Singleline')
  $src = [regex]::Replace($src,'//\s*__ENV_ROUTES_START__.*?//\s*__ENV_ROUTES_END__','', 'Singleline')
  $src = [regex]::Replace($src, '^\s*`{3,}.*$', '// ``` (auto-sanitized)', 'Multiline')
  $src = [regex]::Replace($src, '^\s*`\s*$',    '// ` (auto-sanitized)', 'Multiline')
  $src = [regex]::Replace($src, '(?m)^(?<indent>\s*)`(?!`)', '${indent}// ` (auto-sanitized)')

  # remove any old /__health blocks
  $patStart = [regex]'app\.(?:get|all)\s*\(\s*["'']\/__health["'']\s*,\s*\([^)]*\)\s*=>\s*\{'
  while($true){
    $m = $patStart.Match($src); if(-not $m.Success){ break }
    $i = $m.Index + $m.Length; $depth = 1
    while($i -lt $src.Length -and $depth -gt 0){
      $ch = $src[$i]; if($ch -eq '{'){ $depth++ } elseif($ch -eq '}'){ $depth-- }; $i++
    }
    while($i -lt $src.Length -and ($src.Substring($i) -match '^\s*\)\s*;?')){ $i += $matches[0].Length }
    $src = $src.Substring(0,$m.Index) + $src.Substring($i)
  }

  # inject resolver after last import
  if ($src -notmatch '\bconst\s+__resolveEnv\s*=\s*\(') {
    $resolver = Get-ResolverText
    $imports = [regex]::Matches($src,'(?m)^\s*import\s.+$')
    $pos = if($imports.Count -gt 0){
      $m2 = $imports[$imports.Count-1]; $e = $src.IndexOf("`n",$m2.Index+$m2.Length); if($e -lt 0){$m2.Index+$m2.Length}else{$e+1}
    } else { 0 }
    $src = $src.Insert($pos, $resolver + "`r`n")
  }

  # inject routes before export default app;
  $exportRe = [regex]'(?ms)(\n\s*export\s+default\s+app\s*;)'
  if (-not $exportRe.IsMatch($src)) { throw "export default app; が見つからない（Hono想定）" }

  $routes = Get-RoutesText
  if ($src -match '//\s*__ENV_ROUTES_START__') {
    $src = [regex]::Replace($src,'//\s*__ENV_ROUTES_START__.*?//\s*__ENV_ROUTES_END__', $routes, 'Singleline')
  } else {
    $src = $exportRe.Replace($src,"`r`n$routes`r`n`$1",1)
  }

  Set-Content -Path $Ts -Value $src -Encoding UTF8
  git -C $Api add "src/index.ts" | Out-Null
  git -C $Api commit -m "feat(health): add __env & robust __health; resolver; sanitize fences" | Out-Null
  Write-Host "✅ index.ts patched & committed" -ForegroundColor Green
}

function Assert-CleanPreviewUrls {
  param([string]$TomlPath)
  $orig = Get-Content $TomlPath -Raw -Encoding UTF8

  $txt = $orig
  $patMig = '(?ms)(\[\[migrations\]\][^\[]*?)^\s*preview_urls\s*=.*?$'
  do {
    $prev = $txt
    $txt  = [regex]::Replace($txt, $patMig, '$1', [System.Text.RegularExpressions.RegexOptions]::Multiline)
  } while ($txt -ne $prev)

  $txt = [regex]::Replace($txt, '(?m)^\s*preview_urls\s*=.*?$', '')
  $txt = ('preview_urls = false' + "`r`n" + $txt.TrimStart())

  if ($txt -ne $orig) {
    Set-Content -Path $TomlPath -Value $txt -Encoding UTF8
    git -C $Api add "wrangler.toml" | Out-Null
    git -C $Api commit -m "chore(wrangler): preview_urls=false top-level only; purge from migrations" | Out-Null
    Write-Host "🧹 wrangler.toml fixed (preview_urls top-level only)" -ForegroundColor Green
  }
  if ([regex]::IsMatch($txt,'(?ms)\[\[migrations\]\][^\[]*?^\s*preview_urls\s*=', [System.Text.RegularExpressions.RegexOptions]::Multiline)) {
    throw "preview_urls is still under [[migrations]]"
  }
  Write-Host "✅ wrangler.toml verified clean" -ForegroundColor Green
}

function Assert-WranglerBasics {
  param([string]$TomlPath)
  $txt = Get-Content $TomlPath -Raw -Encoding UTF8
  $changed = $false
  if ($txt -notmatch '(?m)^\s*main\s*=\s*["'']src\/index\.ts["'']') {
    $txt = $txt.TrimEnd() + "`r`nmain = ""src/index.ts""`r`n"; $changed=$true
    Write-Host "⚙️ add main = ""src/index.ts""" -ForegroundColor Yellow
  }
  if ($txt -notmatch '(?m)^\s*compatibility_date\s*=') {
    $txt = $txt.TrimEnd() + "`r`ncompatibility_date = ""$(Get-Date -Format yyyy-MM-dd)""`r`n"; $changed=$true
    Write-Host "⚙️ add compatibility_date" -ForegroundColor Yellow
  }
  if ($txt -notmatch '(?m)^\s*\[env\.production\]\s*$') {
    $txt = $txt.TrimEnd() + "`r`n[env.production]`r`n"; $changed=$true
    Write-Host "⚙️ add [env.production]" -ForegroundColor Yellow
  }
  if ($changed) {
    Set-Content $TomlPath -Value $txt -Encoding UTF8
    git -C $Api add "wrangler.toml" | Out-Null
    git -C $Api commit -m "chore(wrangler): ensure main/compatibility_date/env.production" | Out-Null
    Write-Host "✅ wrangler.toml basics ensured" -ForegroundColor Green
  } else {
    Write-Host "✅ wrangler.toml basics already OK" -ForegroundColor Green
  }
}

function Deploy-Api {
  param([string]$Api,[string]$Wrangler,[switch]$DryRun)
  if ($DryRun) { Write-Host "🧪 DryRun: skip deploy" -ForegroundColor Yellow; return }
  Push-Location $Api
  try {
    npx -y ("wrangler@{0}" -f $Wrangler) deploy --env=staging
    npx -y ("wrangler@{0}" -f $Wrangler) deploy --env=production
  } finally { Pop-Location }
}

function Test-ApiEnv {
  param([string]$Stg,[string]$Prd)
  $targets = @(@{name='STG'; base=$Stg}, @{name='PRD'; base=$Prd})
  foreach($t in $targets){
    try{
      $env  = Invoke-RestMethod "$($t.base)/__env"    -TimeoutSec 10
      $hlth = Invoke-RestMethod "$($t.base)/__health" -TimeoutSec 10
      "{0} ENV={1} | HEALTH ok={2} env={3}" -f $t.name, $env.runtimeEnv, $hlth.ok, $hlth.env
      $checks = $hlth.checks
      if ($null -ne $checks) {
        if ($checks -is [System.Collections.IDictionary]) {
          foreach($k in $checks.Keys){ "  - {0}: ok={1} {2}" -f $k, $checks[$k].ok, ($checks[$k].detail ?? '') }
        } else {
          foreach($p in $checks.PSObject.Properties){ "  - {0}: ok={1} {2}" -f $p.Name, $p.Value.ok, ($p.Value.detail ?? '') }
        }
      }
    } catch {
      Write-Host ("{0} ❌ {1}" -f $t.name, $_.Exception.Message) -ForegroundColor Red
    }
  }
}

Write-Host "🚀 Start fix pipeline" -ForegroundColor Cyan
Assert-RepoPaths
New-Backup $Ts
New-Backup $Toml
Install-BacktickPrecommitHook -Repo $Repo
Patch-IndexTs-EnvAndHealth -Ts $Ts
Assert-CleanPreviewUrls -TomlPath $Toml
Assert-WranglerBasics -TomlPath $Toml
Deploy-Api -Api $Api -Wrangler $Wrangler -DryRun:$DryRun
if (-not $SkipSmoke) {
  Write-Host "🩺 Smoke:" -ForegroundColor Yellow
  Test-ApiEnv -Stg $Stg -Prd $Prd
}
Write-Host "✅ All done." -ForegroundColor Green
