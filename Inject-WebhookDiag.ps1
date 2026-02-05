# Inject-WebhookDiag.ps1
$path = "C:\Users\mesom\src\index.ts"
if (-not (Test-Path $path)) { Write-Error "not found: $path"; exit 1 }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "C:\Users\mesom\Backups\webhook-diag-$stamp-index.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
Copy-Item $path $bak
Write-Host "Backup -> $bak"

$code = Get-Content $path -Raw

# 0) dbgユーティリティを先頭に注入（冪等）
if ($code -notmatch 'function\s+dbg\(') {
  $code = @'
function dbg(...a: any[]) { try { console.log.apply(console, a as any); } catch {} }
'@ + "`r`n" + $code
}

# 1) verifyLineSignature に詳細ログ＋非常口を追加
if ($code -match '(?s)async\s+function\s+verifyLineSignature\s*\(\s*req:\s*Request\s*,\s*env:\s*Env\s*,\s*raw:\s*string\s*\)\s*:\s*Promise<boolean>\s*\{') {
  $code = [regex]::Replace($code,
    '(?s)(async\s+function\s+verifyLineSignature\s*\(\s*req:\s*Request\s*,\s*env:\s*Env\s*,\s*raw:\s*string\s*\)\s*:\s*Promise<boolean>\s*\{\s*)',
    '$1dbg("SIG:ENTER", req.headers.get("x-line-signature") ? "has-sig":"no-sig"); if ((env as any).DEBUG_NO_SIG==="1"){ dbg("SIG:SKIP_BY_ENV"); return true; } '
  )
  # 失敗時のログ（return false直前）を強化
  $code = [regex]::Replace($code,
    '(?s)return\s+false\s*;',
    'dbg("SIG:FAIL"); return false;'
  )
  # 成功時のログ（return true直前）を強化
  $code = [regex]::Replace($code,
    '(?s)return\s+true\s*;',
    'dbg("SIG:OK"); return true;'
  )
}

# 2) /api/line/webhook の入口にログ＆raw取得を注入
#   - URL分岐の直後で ua/sig/raw長 を出力
$code = [regex]::Replace($code,
  '(?s)(if\s*\(\s*url\.pathname\s*===\s*"/api/line/webhook"\s*\)\s*\{\s*)',
  '$1dbg("WEBHOOK:ENTER", req.headers.get("user-agent")||""); const __raw=await req.clone().text(); dbg("WEBHOOK:RAW_LEN", __raw.length); dbg("WEBHOOK:SIGLEN",(req.headers.get("x-line-signature")||"").length); '
)

# 3) req.json() する箇所の直前に events 数をログ（冪等挿入）
$code = [regex]::Replace($code,
  '(?s)const\s+body\s*=\s*await\s*req\.json\(\)\s*;',
  'const body = await req.json(); try{ dbg("LINE_EVENT_COUNT", Array.isArray((body as any)?.events)?(body as any).events.length:0);}catch{}'
)

# 4) イベントループに type ログ（冪等）
$code = [regex]::Replace($code,
  '(?s)for\s*\(\s*const\s+ev\s+of\s+body\.events\s*\)\s*\{\s*',
  'for (const ev of body.events) { try{ dbg("LINE_EVENT_TYPE", ev?.type, ev?.message?.type);}catch{} '
)

# 5) lineReply があれば送信前後をログ
if ($code -match '(?s)async\s+function\s+lineReply\s*\(') {
  $code = [regex]::Replace($code,
    '(?s)async\s+function\s+lineReply\s*\(\s*env:\s*Env\s*,\s*replyToken:\s*string\s*,\s*text:\s*string\s*\)\s*:\s*Promise<Response>\s*\{\s*',
    'async function lineReply(env: Env, replyToken: string, text: string): Promise<Response> { try{ dbg("LINE_REPLY_ATTEMPT", (text||"").slice(0,120)); }catch{} '
  )
  # return new Response(...) をラップ
  $code = [regex]::Replace($code,
    '(?s)return\s+new\s+Response\(([^)]*)\)\s*;',
    'const __r = new Response($1); try{ dbg("LINE_REPLY_OK"); }catch{} return __r;'
  )
}

Set-Content $path -Value $code -Encoding UTF8
Write-Host "Diagnostic logs injected."

# 6) wrangler.toml に DEBUG_NO_SIG 変数を差し込む（無ければ）
$toml = Get-Content "C:\Users\mesom\wrangler.toml" -Raw
if ($toml -notmatch '(?m)^\s*\[vars\]\s*$') {
  $toml += "`r`n[vars]`r`nDEBUG_NO_SIG = ""0""`r`n"
} elseif ($toml -notmatch '(?m)^\s*DEBUG_NO_SIG\s*=') {
  $toml = [regex]::Replace($toml, '(?m)^\s*\[vars\]\s*$', "[vars]`r`nDEBUG_NO_SIG = ""0""")
}
Set-Content "C:\Users\mesom\wrangler.toml" -Value $toml -Encoding UTF8

Write-Host "Deploying..."
wrangler deploy --env="" | Out-Host

