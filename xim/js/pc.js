// xim 다른 PC 에서 이어서 작업하기 — 순서 안내 + 복사용 명령
//   스크립트: xim/runner/setup-pc.ps1(세팅 · 점검 · 동기화 · 자동 시작) · D:\ws\clone\setup_pc.ps1(내 목소리 처리기, 비공개 ws 리포)
//   Claude Code 메모리는 비공개 ws 리포 안(D:\ws\_claude\memory)에 두고 각 PC 의 .claude 폴더에서 정션으로 연결한다 → 어느 PC 에서든 같은 기억으로 이어서 작업
import { $$, esc, toast } from './common.js';

const RAW = 'https://raw.githubusercontent.com/xiangdolee-pixel/webmaker2/main/xim/runner/setup-pc.ps1';
const SETUP = 'D:\\ws\\webmaker2\\xim\\runner\\setup-pc.ps1';
const PS = 'powershell -ExecutionPolicy Bypass';
const CMD = {
  tools: 'winget install -e --id Git.Git\nwinget install -e --id OpenJS.NodeJS.LTS\nwinget install -e --id GitHub.cli\nwinget install -e --id Python.Python.3.12\nnpm install -g @anthropic-ai/claude-code',
  gh: 'gh auth login',
  boot: `${PS} -Command "iwr ${RAW} -OutFile $env:TEMP\\setup-pc.ps1; & $env:TEMP\\setup-pc.ps1 -Setup"`,
  claude: 'claude',
  cf: 'node D:\\ws\\webmaker2\\deploy.mjs --login\nnode D:\\ws\\webmaker2\\deploy.mjs --whoami',
  start: 'cd /d D:\\ws\\webmaker2\nclaude',
  check: `${PS} -File ${SETUP}`,
  sync: `${PS} -File ${SETUP} -Sync`,
  helperLogin: 'node D:\\ws\\webmaker2\\xim\\runner\\runner.mjs --login',
  helperStart: 'D:\\ws\\docs\\tools\\스튜디오도우미_시작.bat',
  helperAuto: `${PS} -File ${SETUP} -Startup helper`,
  voiceStart: 'D:\\ws\\clone\\start_all.bat',
  voiceAuto: `${PS} -File ${SETUP} -Startup voice`,
};

const code = (text) => `<div class="pc-cmd"><pre>${esc(text)}</pre><button class="btn sm" type="button" data-copy>복사</button></div>`;
const step = (n, title, body) => `<li class="pc-step"><b class="n">${n}</b><div><h4>${title}</h4>${body}</div></li>`;
const chip = (on, label) => `<span class="pc-chip ${on ? 'on' : ''}"><i></i>${label} ${on ? '켜짐' : '꺼짐'}</span>`;

export async function renderPc({ view, api }) {
  const [helper, voice, hs] = await Promise.all([
    api('/studio/helper-token').catch(() => ({})),
    api('/voice-agent-token').catch(() => ({})),
    api('/studio/helper-status').catch(() => ({})),
  ]);
  let agent = null; try { agent = (await api('/voice/me')).agent; } catch { /* clone 미연결 */ }
  const helperCmd = helper.token ? `node D:\\ws\\webmaker2\\xim\\runner\\runner.mjs --setup --token ${helper.token}` : '도우미 토큰이 아직 없습니다 (Worker 비밀값 STUDIO_HELPER_TOKEN)';
  const voiceCmd = voice.token ? `${PS} -File D:\\ws\\clone\\setup_pc.ps1 -Token ${voice.token}` : '처리기 토큰이 아직 없습니다 (Worker 비밀값 CLONE_TOKEN)';
  const helperPc = hs.info?.host || hs.info?.pc || '';

  view.innerHTML = `
    <div class="pc-guide">
      <div class="card">
        <div class="pc-head"><h2>다른 PC 에서 이어서 작업하기</h2><span class="pc-status">${chip(!!hs.online, `스튜디오 도우미${helperPc ? ` · ${esc(helperPc)}` : ''}`)}${chip(!!agent?.online, '내 목소리 처리기')}</span></div>
        <p class="pc-desc">PC 가 맡는 일은 세 가지입니다. <b>① 코드 작업</b>(Claude Code 로 xim · 사이트 · 처리기 코드 고치기)은 어느 PC 에서나 할 수 있고, <b>② 스튜디오 도우미</b>(글 · 그림 제작)와 <b>③ 내 목소리 처리기</b>(GPU)는 <b>한 PC 에서만</b> 켜 둡니다. 보통은 ①만 새 PC 에 세팅하고 ② ③ 은 원래 PC 가 켜진 채로 둡니다.</p>
        <p class="pc-desc">Claude 의 기억(메모리)은 비공개 저장소 <code>D:\\ws\\_claude\\memory</code> 에 있어서, 아래 ① 을 마치면 새 PC 의 Claude 도 지금까지의 작업 내용 · 규칙 · 남은 일을 그대로 알고 이어갑니다.</p>
      </div>

      <div class="card">
        <h3>① 코드 작업 PC — 처음 한 번</h3>
        <ol class="pc-steps">
          ${step(1, '프로그램 설치 (없는 것만)', `<p>Git · Node 20 · GitHub CLI · Python 3.12 · Claude Code. 터미널(PowerShell 또는 cmd)에 한 줄씩 붙여 넣습니다. 설치 뒤 <b>터미널을 새로 엽니다.</b></p>${code(CMD.tools)}`)}
          ${step(2, 'GitHub 로그인', `<p>비공개 저장소(ws)를 받기 위해 한 번. 브라우저가 열리면 xiangdolee-pixel 계정으로 승인합니다.</p>${code(CMD.gh)}`)}
          ${step(3, '한 줄 세팅', `<p>저장소 2개를 <code>D:\\ws</code> · <code>D:\\ws\\webmaker2</code> 에 받고, Claude 메모리를 저장소에 연결한 뒤 점검표를 보여 줍니다. D: 드라이브가 없는 PC 면 Claude 에게 말해 주세요.</p>${code(CMD.boot)}`)}
          ${step(4, '로그인 2개 (각 한 번)', `<p>Claude Code 는 구독 계정으로, Cloudflare 배포는 브라우저에서 <b>xiangdolee 계정</b>을 고릅니다. 두 번째 줄이 계정 이름을 보여 주면 된 것입니다.</p>${code(CMD.claude)}${code(CMD.cf)}`)}
          ${step(5, '작업 시작', `<p>webmaker2 폴더에서 Claude Code 를 열고 <b>"메모리 보고 이어서 하자"</b> 라고 하면 됩니다. 커밋 · 푸시 · 배포는 Claude 가 합니다.</p>${code(CMD.start)}<p class="pc-sub">점검만 다시 보려면:</p>${code(CMD.check)}`)}
        </ol>
      </div>

      <div class="card">
        <h3>PC 를 옮길 때마다 — 동기화 한 줄</h3>
        <p class="pc-desc"><b>떠나는 PC 에서 먼저, 도착한 PC 에서 또 한 번</b> 같은 명령을 실행합니다. Claude 메모리와 처리기 코드를 커밋 · 푸시하고 두 저장소를 받아 옵니다. 공개 저장소(webmaker2)에 커밋 안 된 코드가 있으면 알려만 주니, 그때는 Claude 에게 "커밋하고 푸시해 줘" 라고 하세요.</p>
        ${code(CMD.sync)}
        <p class="pc-sub">Claude Code 안에서 "동기화해 줘" 라고 해도 같은 일을 합니다.</p>
      </div>

      <div class="card">
        <h3>② 스튜디오 도우미 PC — 글 · 그림을 만드는 PC 로 바꿀 때만</h3>
        <p class="pc-desc">① 이 끝난 PC 에서. 그림은 ChatGPT Plus 를 자동화 전용 브라우저로 쓰므로 그 PC 에 엣지(또는 Brave)가 있어야 합니다. 자세한 순서는 저장소의 <code>xim/runner/README.md</code>.</p>
        <ol class="pc-steps">
          ${step(1, '도우미 설정 점검 (토큰 포함 — 이 줄은 남에게 보여 주지 마세요)', code(helperCmd))}
          ${step(2, 'ChatGPT 로그인 (한 번)', `<p>자동화 전용 프로필 창이 뜨면 chatgpt.com 에 로그인하고 창을 닫습니다.</p>${code(CMD.helperLogin)}`)}
          ${step(3, '켜기 · 자동 시작', `<p>지금 켜려면 첫 줄, 로그인할 때마다 자동으로 켜지고 꺼지면 2분 안에 다시 켜지게(워치독) 하려면 둘째 줄. <b>원래 PC 의 도우미는 꺼 두세요</b>(그 PC 에서 시작프로그램의 bat 을 지우고 <code>schtasks /Delete /TN xim_watchdog /F</code>).</p>${code(CMD.helperStart)}${code(CMD.helperAuto)}`)}
        </ol>
      </div>

      <div class="card">
        <h3>③ 내 목소리 처리기 PC — NVIDIA GPU(8GB 이상) 가 있는 PC 로 바꿀 때만</h3>
        <p class="pc-desc">① 이 끝나고 Cloudflare 로그인까지 된 PC 에서. 내 목소리 모델(약 290MB)은 R2 에 올려 두었고, GPT-SoVITS 와 사전학습 모델(약 5GB)은 스크립트가 받습니다. 시간이 20~40분 걸립니다.</p>
        <p class="pc-warn">이 설치 스크립트는 지금 PC 에서 손으로 했던 순서를 옮겨 적은 것이라 새 PC 에서 아직 끝까지 돌려 보지 못했습니다. 막히면 그 화면을 Claude Code 에게 보여 주며 "clone/setup_pc.ps1 돌리다 여기서 막혔어" 라고 하면 됩니다.</p>
        <ol class="pc-steps">
          ${step(1, '설치 + 토큰 (토큰 포함 — 이 줄은 남에게 보여 주지 마세요)', code(voiceCmd))}
          ${step(2, '켜기 · 자동 시작', `<p>TTS 서버와 처리기 창 두 개가 최소화돼 뜹니다. 내 목소리 화면 오른쪽 위 표시가 켜짐으로 바뀌면 됩니다. 둘째 줄은 로그인 때 자동 시작 + 꺼지면 2분 안에 다시 켜는 워치독. <b>원래 PC 의 처리기는 꺼 두세요.</b></p>${code(CMD.voiceStart)}${code(CMD.voiceAuto)}`)}
        </ol>
      </div>

      <div class="card">
        <h3>알아 둘 것</h3>
        <ul class="pc-notes">
          <li>Worker 비밀값(토큰 · 메일 키)은 Cloudflare 에 있어 PC 를 바꿔도 그대로입니다. PC 쪽 설정 파일(<code>docs\\tools\\_xim_helper.json</code>, <code>clone\\secrets.json</code>)은 저장소에 올라가지 않으니 위 명령으로 PC 마다 만듭니다.</li>
          <li>학습 자료(원본 음성 · 잘라 둔 조각)와 가상환경은 원래 PC 에만 있습니다. 모델을 <b>다시 학습</b>할 일이 있으면 원래 PC 에서 합니다.</li>
          <li>메모리 폴더는 <code>%USERPROFILE%\\.claude\\projects\\D--ws-webmaker2\\memory</code> 가 저장소 폴더를 가리키는 정션입니다. Claude 가 메모리를 고치면 바로 저장소 파일이 바뀌고, 동기화 명령이 커밋합니다.</li>
        </ul>
      </div>
    </div>`;

  $$('[data-copy]', view).forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.previousElementSibling.textContent); toast('복사했습니다'); } catch { toast('복사하지 못했습니다'); }
  }));
}
