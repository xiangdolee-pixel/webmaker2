// 고객에게 보낸 문서 주소(/jd/wD5Jd4)에서 열리는 J-Docs 화면 — 로그인 없이 보기 · PDF 받기 · 인쇄
import { TYPES } from './calc.js';
import { layout, clearMeasure } from './layout.js';
import { pageSVGs, toPDF, printSVG, download, loadDocFont, stampPng } from './render.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 문서 주소(wD5Jd4) = 경로의 마지막 마디
const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
const API = `/api/jdp/${slug}`;

let toastT;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = 'toast'; }, kind === 'err' ? 5000 : 2600);
}
let doc = null, settings = null, imgs = {}, model = null;

async function load() {
  const j = await fetch(API).then((r) => r.json());
  if (!j.ok) throw new Error(j.error || '문서를 불러오지 못했습니다.');
  doc = j.doc;
  settings = { company: j.company || {} };
  imgs = {};
  // 직인 · 공문 도장은 같은 그림. 없으면 그림 없이 그린다
  if (doc.stamp !== false) { const im = await stampPng(`${API}/stamp`); if (im) imgs = { stamp: im.url, seal: im.url }; }
}
function draw() {
  model = layout(doc, settings);
  $('#pvMain').innerHTML = `<div class="pv-pages">${pageSVGs(model, imgs).map((s) => `<div class="pv-page">${s}</div>`).join('')}</div>`;
}
const typeName = () => (TYPES[doc.type] || TYPES.quote).name;
const fileName = () => `${doc.no || ''}_${doc.title || typeName()}-${doc.client?.name || ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

function tools() {
  $('#pvTools').innerHTML = '<button type="button" class="btn btn-sm" id="pvPrint">인쇄</button><button type="button" class="btn btn-sm btn-primary" id="pvPdf">PDF 받기</button>';
  $('#pvPdf').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = '만드는 중…';
    try {
      download(await toPDF(model, imgs, { title: doc.title, author: settings.company.name }), `${fileName()}.pdf`);
      toast('PDF를 내려받았습니다.');
    } catch (x) { toast(x.message, 'err'); } finally { b.disabled = false; b.textContent = 'PDF 받기'; }
  };
  $('#pvPrint').onclick = () => { try { printSVG(pageSVGs(model, imgs), fileName()); } catch (x) { toast(x.message, 'err'); } };
}

(async () => {
  try {
    await Promise.all([load(), loadDocFont().catch(() => null)]);
    clearMeasure();
    $('#pvTitle').textContent = doc.title || typeName();
    draw(); tools();
  } catch (e) {
    $('#pvMain').innerHTML = `<p class="pv-msg"><b>문서를 열 수 없습니다</b><br>${esc(e.message)}</p>`;
  }
})();
