<#
  다른 PC 에서 이어서 작업하기 — 세팅 · 점검 · 동기화 (xim → "다른 PC" 화면이 이 스크립트를 안내한다)

  처음 한 번(새 PC):  powershell -ExecutionPolicy Bypass -File setup-pc.ps1 -Setup
     → D:\ws(비공개 ws) · D:\ws\webmaker2(공개) 저장소를 받고, Claude Code 메모리 폴더를 저장소 안(D:\ws\_claude\memory)에 연결(정션)한 뒤 점검표를 보여 준다.
  PC 를 옮기기 전 · 옮긴 뒤:  … -Sync
     → 메모리 · clone 코드를 커밋 + 푸시하고 두 저장소를 pull 한다. (webmaker2 의 코드 커밋은 Claude 가 한다 — 안 된 게 있으면 알려만 준다)
  자동 시작 등록:  … -Startup helper   (스튜디오 도우미)   /   … -Startup voice   (내 목소리 처리기, GPU PC)
  인자 없이 실행하면 점검만.

  왜 D:\ws 로 고정하나: 도우미 · 처리기 bat 과 Claude 메모리 폴더 이름(D--ws-webmaker2)이 이 경로를 가정한다. D: 드라이브가 없는 PC 는 Claude 에게 말해 주세요.
#>
param([switch]$Setup, [switch]$Sync, [string]$Startup = '')
$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$WS = 'D:\ws'
$WM = "$WS\webmaker2"
$WS_URL = 'https://github.com/xiangdolee-pixel/ws.git'
$WM_URL = 'https://github.com/xiangdolee-pixel/webmaker2.git'
$MEM_REPO = "$WS\_claude\memory"
$MEM_LOCAL = Join-Path $env:USERPROFILE '.claude\projects\D--ws-webmaker2\memory'
$CF_ACCOUNT = 'f225d506d8cf6ddf97704a36c69f5ce7'   # xiangdolee 의 Cloudflare 계정(배포는 반드시 이 계정)

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Row($ok, $name, $hint) {
  if ($ok) { Write-Host ("  [O] " + $name) -ForegroundColor Green }
  else {
    Write-Host ("  [X] " + $name) -ForegroundColor Yellow
    if ($hint) { Write-Host ("      -> " + $hint) -ForegroundColor DarkGray }
  }
}
function Git($path, [string[]]$args) { & git -C $path @args 2>&1 | ForEach-Object { "$_" } }

# ───────── 점검 ─────────
function Check {
  Write-Host ""
  Write-Host ("[점검] " + $env:COMPUTERNAME + "  " + (Get-Date -Format 'yyyy-MM-dd HH:mm')) -ForegroundColor Cyan
  Row (Has git) 'Git' 'winget install -e --id Git.Git'
  $nodeOk = $false
  if (Has node) { try { $v = ((& node -v) -replace '^v', ''); $nodeOk = ([int]($v.Split('.')[0]) -ge 20) } catch { } }
  Row $nodeOk 'Node 20 이상' 'winget install -e --id OpenJS.NodeJS.LTS'
  $ghOk = $false
  if (Has gh) { & gh auth status *> $null; $ghOk = ($LASTEXITCODE -eq 0) }
  Row $ghOk 'GitHub 로그인(gh) — 비공개 저장소 받기에 필요' 'winget install -e --id GitHub.cli   그 다음   gh auth login'
  Row (Has claude) 'Claude Code' 'npm install -g @anthropic-ai/claude-code   그 다음   claude 를 실행해 구독 계정으로 로그인'
  Row (Test-Path "$WS\.git") '비공개 저장소 D:\ws (docs 엔진 · clone 코드 · Claude 메모리)' '이 스크립트를 -Setup 으로 실행'
  Row (Test-Path "$WM\.git") '공개 저장소 D:\ws\webmaker2 (xim · 사이트 · Worker)' '이 스크립트를 -Setup 으로 실행'
  $memOk = $false
  if (Test-Path $MEM_LOCAL) { $i = Get-Item $MEM_LOCAL -Force; $memOk = ($i.LinkType -eq 'Junction') -and ("$($i.Target)" -like '*_claude\memory') }
  Row $memOk 'Claude 메모리가 저장소(D:\ws\_claude\memory)에 연결됨' '이 스크립트를 -Setup 으로 실행'
  $cfOk = $false
  if ((Has node) -and (Test-Path "$WM\deploy.mjs")) {
    Write-Host '      (Cloudflare 로그인 확인 중…)' -ForegroundColor DarkGray
    try { $who = (& node "$WM\deploy.mjs" --whoami 2>&1 | Out-String); $cfOk = $who -match $CF_ACCOUNT } catch { }
  }
  Row $cfOk 'Cloudflare 배포 로그인(xiangdolee 계정)' 'node D:\ws\webmaker2\deploy.mjs --login   (브라우저에서 xiangdolee 계정 고르기)'
  Write-Host '  ── 이 PC 가 맡을 일만 해당 ──' -ForegroundColor DarkGray
  Row (Test-Path "$WS\docs\tools\_xim_helper.json") '스튜디오 도우미 설정 (그림 · 글 제작 PC)' 'xim → 다른 PC 화면 ② (이 PC 가 안 맡으면 무시)'
  Row (Test-Path "$WS\clone\.venv") '내 목소리 처리기 (NVIDIA GPU PC)' 'xim → 다른 PC 화면 ③ (이 PC 가 안 맡으면 무시)'
  Write-Host ""
}

# ───────── 저장소 ─────────
function EnsureRepo($path, $url, $label) {
  if (Test-Path "$path\.git") {
    Write-Host ("  " + $label + ": 있음 → 최신으로") -ForegroundColor DarkGray
    Git $path @('pull', '--ff-only', 'origin', 'main') | Out-Null
    return
  }
  if (Test-Path $path) {
    # 폴더는 있는데 저장소가 아닐 때(예: webmaker2 만 먼저 받아 둔 D:\ws) — 그 자리에서 저장소를 깐다
    Write-Host ("  " + $label + ": 폴더에 저장소 연결 (" + $url + ")")
    Git $path @('init') | Out-Null
    Git $path @('remote', 'add', 'origin', $url) | Out-Null
    Git $path @('fetch', 'origin', 'main')
    Git $path @('checkout', '-B', 'main', 'origin/main')
  } else {
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    Write-Host ("  " + $label + ": 받는 중 (" + $url + ")")
    & git clone $url $path
  }
  if (-not (Test-Path "$path\.git")) { throw ($label + " 받기 실패 — 비공개 저장소는 먼저 'gh auth login' (브라우저 로그인) 뒤 다시 실행") }
}

# ───────── Claude 메모리 ─────────
function LinkMemory {
  if (-not (Test-Path $MEM_REPO)) { throw "저장소에 메모리 폴더가 없습니다: $MEM_REPO  (D:\ws 를 먼저 받으세요)" }
  if (Test-Path $MEM_LOCAL) {
    $i = Get-Item $MEM_LOCAL -Force
    if ($i.LinkType -eq 'Junction') { Write-Host '  Claude 메모리: 이미 연결됨' -ForegroundColor DarkGray; return }
    # 이 PC 에만 있던 메모리는 저장소에 없는 파일만 보태고(같은 이름은 저장소 쪽을 믿음), 원래 폴더는 백업으로 남긴다
    & robocopy $MEM_LOCAL $MEM_REPO /E /XC /XN /XO /NFL /NDL /NJH /NJS | Out-Null
    $bak = $MEM_LOCAL + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Rename-Item $MEM_LOCAL $bak
    Write-Host ("  Claude 메모리: 이 PC 의 기존 메모리는 " + $bak + " 에 백업") -ForegroundColor DarkGray
  } else {
    New-Item -ItemType Directory -Force (Split-Path $MEM_LOCAL) | Out-Null
  }
  & cmd /c mklink /J "$MEM_LOCAL" "$MEM_REPO" | Out-Null
  Write-Host ("  Claude 메모리: " + $MEM_LOCAL + "  →  " + $MEM_REPO) -ForegroundColor Green
}

# ───────── 동기화 ─────────
function SyncRepos {
  Write-Host '[동기화] D:\ws — Claude 메모리 · clone 코드' -ForegroundColor Cyan
  if (-not (Test-Path "$WS\.git")) { throw 'D:\ws 저장소가 없습니다. 먼저 -Setup' }
  $paths = @('_claude', 'clone') | Where-Object { Test-Path (Join-Path $WS $_) }
  if ($paths.Count) {
    Git $WS (@('add', '-A', '--') + $paths) | Out-Null
    $st = Git $WS (@('status', '--porcelain', '--') + $paths)
    if ($st) {
      $msg = 'chore: Claude 메모리 · clone 코드 동기화 (' + $env:COMPUTERNAME + ' ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ')'
      Git $WS @('commit', '-q', '-m', $msg) | Out-Null
      Write-Host ('  커밋: ' + $msg)
    } else { Write-Host '  올릴 변경 없음' -ForegroundColor DarkGray }
  }
  Git $WS @('pull', '--rebase', '--autostash', 'origin', 'main')
  if ($LASTEXITCODE -ne 0) { Write-Host "  !! pull 중 충돌 — Claude 에게 'D:\ws 리베이스 충돌 풀어 줘' 라고 하세요" -ForegroundColor Red; return }
  Git $WS @('push', 'origin', 'main')
  Write-Host '[동기화] D:\ws\webmaker2' -ForegroundColor Cyan
  if (Test-Path "$WM\.git") {
    $dirty = Git $WM @('status', '--porcelain')
    if ($dirty) { Write-Host "  커밋 안 된 변경이 있습니다 — Claude 에게 '커밋하고 푸시해 줘' 라고 하세요 (공개 저장소라 자동 커밋하지 않음)" -ForegroundColor Yellow }
    Git $WM @('pull', '--rebase', '--autostash', 'origin', 'main')
    Git $WM @('push', 'origin', 'main')
  }
  Write-Host '  끝. 다른 PC 에서는 같은 명령(-Sync)을 먼저 실행해 받으세요.' -ForegroundColor Green
}

# ───────── 자동 시작 ─────────
function RegisterStartup($what) {
  $dir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
  switch ($what) {
    'helper' { $bat = "$WS\docs\tools\스튜디오도우미_시작.bat"; $name = 'xim-studio-helper.bat'; $label = '스튜디오 도우미' }
    'voice'  { $bat = "$WS\clone\start_all.bat";            $name = 'clone-voice.bat';       $label = '내 목소리 처리기' }
    default  { throw '-Startup helper  또는  -Startup voice' }
  }
  if (-not (Test-Path $bat)) { throw ($label + ' 시작 파일이 없습니다: ' + $bat) }
  $content = "@echo off`r`nstart `"`" /min `"$bat`"`r`n"
  # 한글 경로가 든 bat 은 cp949 로 써야 시작프로그램에서 깨지지 않는다
  [IO.File]::WriteAllText((Join-Path $dir $name), $content, [Text.Encoding]::GetEncoding(949))
  Write-Host ($label + ' 자동 시작 등록: ' + (Join-Path $dir $name)) -ForegroundColor Green
  Write-Host '  지금 바로 켜려면 그 bat 을 더블클릭. 로그인할 때마다 자동으로 켜집니다.'
}

# ───────── 실행 ─────────
if ($Startup) { RegisterStartup $Startup; exit 0 }
if ($Sync) { SyncRepos; exit 0 }
if ($Setup) {
  Write-Host '[세팅] 저장소 받기' -ForegroundColor Cyan
  if (-not (Test-Path 'D:\')) { throw 'D: 드라이브가 없습니다. 이 구성은 D:\ws 를 가정합니다 — Claude 에게 말해 주세요.' }
  if (-not (Has git)) { throw 'Git 이 없습니다: winget install -e --id Git.Git  뒤 새 터미널에서 다시' }
  EnsureRepo $WS $WS_URL '비공개 저장소 D:\ws'
  EnsureRepo $WM $WM_URL '공개 저장소 D:\ws\webmaker2'
  Write-Host '[세팅] Claude 메모리 연결' -ForegroundColor Cyan
  LinkMemory
  Check
  Write-Host '다음 할 일 (터미널에서 직접, 각각 한 번):' -ForegroundColor Cyan
  Write-Host '  1) claude                                   → 구독 계정으로 로그인'
  Write-Host '  2) node D:\ws\webmaker2\deploy.mjs --login  → 브라우저에서 xiangdolee 계정 고르기 (배포용)'
  Write-Host '  3) cd D:\ws\webmaker2  →  claude  →  "메모리 보고 이어서 하자" 라고 말하면 됩니다'
  Write-Host '  도우미 · 처리기를 이 PC 가 맡을 때만: xim → 다른 PC 화면 ② ③'
  exit 0
}
Check
