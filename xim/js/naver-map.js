// xim 네이버 지도 — 네이버 클라우드 Maps Application 정보와 등록된 사이트 주소 (사용자 지시 2026-11-13)
//   고객 사이트는 xim 공용 지도(/map, _worker/index.js sharedMap)를 iframe 으로 붙인다 — 사이트마다 네이버 등록 불필요(2026-11-14).
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
      <h3>사이트에 네이버 지도를 띄우려면 — 등록 없이, 사이트 수 제한 없음</h3>
      <ol>
        <li>네이버 키는 등록한 주소에서만 동작하므로, 지도는 <b>xim 공용 지도(https://xim.plators.com/map) 한 곳</b>에서 그립니다. 이 주소는 네이버에 이미 등록돼 있습니다(plators.com).</li>
        <li>고객 사이트에는 지도 자리에 이렇게 붙이면 끝입니다 — 네이버 콘솔에 사이트 주소를 추가할 필요가 없습니다:<br><code>&lt;iframe src="https://xim.plators.com/map?addr=주소&amp;name=회사이름" loading="lazy"&gt;&lt;/iframe&gt;</code><br>(선택: <code>&amp;zoom=16</code> 확대 정도, <code>&amp;c=153c54</code> 이름표 색, <code>&amp;shift=1</code> 왼쪽 카드만큼 지도를 오른쪽으로)</li>
        <li>아래 Web 서비스 URL 목록은 옛 방식(사이트마다 등록) 기록입니다. 새로 등록하지 않아도 됩니다.</li>
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
