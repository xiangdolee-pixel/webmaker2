// xim 네이버 지도 — 네이버 클라우드 Maps Application 정보와 등록된 사이트 주소 (사용자 지시 2026-11-13)
//   홈페이지에 네이버 지도가 나오려면 그 사이트 주소가 Application 의 'Web 서비스 URL' 에 있어야 한다(최대 10개).
//   여기 값은 기록용(xim DB settings.naver_map) — 네이버 쪽 등록은 콘솔에서 바꾼다.
import { $, esc, toast, openDialog, busy } from './common.js';

const CONSOLE = 'https://console.ncloud.com/maps/application';
const MAX_URLS = 10;
let deps = null;

export async function renderNaverMap(d) {
  deps = d;
  const { view, api } = deps;
  const m = await api('/naver-map');
  const urls = m.urls || [];
  view.innerHTML = `
    <div class="bar"><h2>네이버 지도</h2>
      <a class="btn primary" href="${CONSOLE}" target="_blank" rel="noopener">네이버 클라우드 콘솔 열기 ↗</a>
      <button class="btn" type="button" data-edit>정보 고치기</button></div>
    <div class="card nm-how">
      <h3>사이트에 네이버 지도를 띄우려면</h3>
      <ol>
        <li>홈페이지에 네이버 지도가 나오려면 <b>그 사이트 주소가 아래 'Web 서비스 URL' 에 등록</b>돼 있어야 합니다. 등록되지 않은 주소에서는 지도가 뜨지 않습니다.</li>
        <li>주소는 <b>Application 하나에 최대 ${MAX_URLS}개</b>까지 넣을 수 있습니다. 새로 가입하거나 결제를 다시 등록할 필요 없이 이 Application 에 추가하면 됩니다.</li>
        <li>추가하는 곳: 위 <b>콘솔 열기</b> → Maps › Application 에서 <b>${esc(m.name || 'Application')}</b> 을 고르고 <b>변경</b> → 서비스 환경 등록 › Web 서비스 URL 에 <code>https://사이트주소</code> 를 넣고 <b>+ 추가</b> → 저장.</li>
        <li>정식 도메인을 붙이면 workers.dev 주소와 정식 도메인을 <b>둘 다</b> 넣어 두면 좋습니다. plators.com 하나만 넣는다고 다른 도메인이 되지는 않습니다.</li>
        <li>콘솔에서 바꾼 뒤 아래 <b>정보 고치기</b>로 여기 목록도 맞춰 두세요(여기를 고쳐도 네이버 쪽은 바뀌지 않습니다).</li>
      </ol>
    </div>
    <div class="card nm-info">
      <h3>Application key</h3>
      <dl class="nm-dl">
        <div><dt>Application 이름</dt><dd>${esc(m.name || '-')}</dd></div>
        <div><dt>Client ID<small>X-NCP-APIGW-API-KEY-ID</small></dt><dd><code>${esc(m.client_id || '-')}</code>${m.client_id ? '<button class="btn sm" type="button" data-copy="id">복사</button>' : ''}</dd></div>
        <div><dt>Client Secret<small>X-NCP-APIGW-API-KEY</small></dt><dd>${m.client_secret ? `<code data-secret>${'•'.repeat(16)}</code><button class="btn sm" type="button" data-show>보기</button><button class="btn sm" type="button" data-copy="secret">복사</button>` : '-'}</dd></div>
        <div><dt>사용 API</dt><dd>${esc((m.apis || []).join(' · ') || '-')}</dd></div>
      </dl>
      <h3>Web 서비스 URL <span class="nm-count">${urls.length} / ${MAX_URLS}</span></h3>
      <ul class="nm-urls">${urls.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('') || '<li class="nm-empty">등록된 주소가 없습니다.</li>'}</ul>
      <p class="nm-note">Client ID 는 홈페이지 코드(지도 자리)에 들어가 공개되는 값이고, Client Secret 은 서버에서만 쓰는 값이라 남에게 보내지 않습니다.</p>
    </div>`;
  const copy = (v, label) => navigator.clipboard.writeText(v).then(() => toast(`${label}를 복사했습니다.`));
  view.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => (b.dataset.copy === 'id' ? copy(m.client_id, 'Client ID') : copy(m.client_secret, 'Client Secret'))));
  $('[data-show]', view)?.addEventListener('click', (e) => {
    const c = $('[data-secret]', view), on = e.currentTarget.textContent === '보기';
    c.textContent = on ? m.client_secret : '•'.repeat(16);
    e.currentTarget.textContent = on ? '숨기기' : '보기';
  });
  $('[data-edit]', view).addEventListener('click', () => edit(m));
}

function edit(m) {
  openDialog(`
    <h2>네이버 지도 정보 고치기</h2>
    <form data-f>
      <label class="field"><span>Application 이름</span><input class="input" name="name" maxlength="60" value="${esc(m.name || '')}"></label>
      <div class="row2">
        <label class="field"><span>Client ID</span><input class="input" name="client_id" maxlength="80" value="${esc(m.client_id || '')}"></label>
        <label class="field"><span>Client Secret</span><input class="input" name="client_secret" maxlength="120" value="${esc(m.client_secret || '')}" autocomplete="off"></label>
      </div>
      <label class="field"><span>사용 API</span><input class="input" name="apis" maxlength="200" value="${esc((m.apis || []).join(', '))}" placeholder="Dynamic Map, Geocoding"><small>쉼표로 나눕니다.</small></label>
      <label class="field"><span>Web 서비스 URL (한 줄에 하나, 최대 ${MAX_URLS}개)</span><textarea class="input" name="urls" rows="6" placeholder="https://bsf.xiangdolee.workers.dev">${esc((m.urls || []).join('\n'))}</textarea><small>네이버 콘솔에 등록된 주소와 똑같이 맞춰 주세요.</small></label>
      <p class="err" data-err></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
    </form>`, (dlg) => {
    const f = $('[data-f]', dlg);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const urls = v.urls.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      if (urls.length > MAX_URLS) { $('[data-err]', dlg).textContent = `주소는 ${MAX_URLS}개까지입니다. (지금 ${urls.length}개)`; return; }
      busy(f.querySelector('[type=submit]'), $('[data-err]', dlg), async () => {
        await deps.api('/naver-map', { method: 'PUT', data: { ...v, urls, apis: v.apis.split(',').map((s) => s.trim()).filter(Boolean) } });
        dlg.close(); toast('저장했습니다.'); renderNaverMap(deps);
      });
    });
  });
}
