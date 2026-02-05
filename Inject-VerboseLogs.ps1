# Inject-VerboseLogs.ps1
$path = "C:\Users\mesom\src\index.ts"
if (-not (Test-Path $path)) { Write-Error "not found: $path"; exit 1 }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bak = "C:\Users\mesom\Backups\verbose-logs-$stamp-index.ts"
New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null
Copy-Item $path $bak
Write-Host "Backup -> $bak"

$code = Get-Content $path -Raw

# 1) Webhook入口に必ずHITログが出るように置換（重複は気にせず冪等）
$code = [regex]::Replace($code,
  '(?s)(async\s+function\s+handleLineWebhook\s*\(\s*req:\s*Request\s*,\s*env:\s*Env\s*\)\s*:\s*Promise<Response>\s*\{\s*)',
  "`$1  try { console.log('LINE_WEBHOOK:START', req.method, req.headers.get('user-agent')||''); } catch(e) {}`r`n"
)

# 2) events配列のログを強制
$code = [regex]::Replace($code,
  '(?s)const\s+body\s*=\s*await\s*req\.json\(\)\s*;(\s*)',
  'const body = await req.json();$1try { console.log("LINE_EVENT_COUNT", Array.isArray(body?.events)?body.events.length:0); } catch(e) {}$1'
)

# 3) 各イベントのtypeログ（存在しなければ注入）
$code = [regex]::Replace($code,
  '(?s)for\s*\(\s*const\s*ev\s+of\s+body\.events\s*\)\s*\{\s*',
  'for (const ev of body.events) { try { console.log("LINE_EVENT_TYPE", ev?.type, ev?.message?.type); } catch(e) {} '
)

# 4) reply前後のログフック（lineReply関数がある前提）
if ($code -match '(?s)async\s+function\s+lineReply\s*\(') {
  $code = [regex]::Replace($code,
    '(?s)async\s+function\s+lineReply\s*\(\s*env:\s*Env\s*,\s*replyToken:\s*string\s*,\s*text:\s*string\s*\)\s*:\s*Promise<Response>\s*\{\s*',
    'async function lineReply(env: Env, replyToken: string, text: string): Promise<Response> { try { console.log("LINE_REPLY_ATTEMPT", text?.slice(0,120)); } catch(e) {} '
  )
  $code = [regex]::Replace($code,
    '(?s)return\s+new\s+Response\([^)]*\);\s*\}\s*$',
    'const r = new Response($1); try { console.log("LINE_REPLY_OK"); } catch(e) {} return r; }'
  )
}

Set-Content $path -Value $code -Encoding UTF8
Write-Host "Verbose logs injected."

wrangler deploy --env="" | Out-Host
