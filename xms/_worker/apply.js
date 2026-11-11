// 신청서 (사이트 기능 'apply' 를 켠 사이트만) — 지금은 장학금 신청서 하나 (첫 사이트: sjccc)
//   방문자: /member/apply — 회원만(등급 상관없이 가입만 했으면). 신청 기간(회차) 안에서만 내고, 기간 안에는 고칠 수 있다.
//           안내 → 기본정보 → 학비 부담자 → 가정 환경 → 신청 사유 → 서류 → 확인(봇 확인) 순서로 한 단계씩.
//           서류는 /xms-api/uploads?for=apply&kind=APPLY 로 올린다(사진은 화면에서 WEBP 로 줄여서). 낸 사람 · 관리자만 열어 볼 수 있다.
//   관리자: /xms-api/admin/apply… — 신청 기간(회차) 만들기 · 고치기, 신청서 목록 · 보기 · 상태 · 메모 · 엑셀
//   표: apply_rounds, applications (schema.sql). 서류 파일 = uploads(kind 'APPLY', post_id = APPLY_BASE − 신청서 번호)
import { now, bad, notFound, json, str, body, audit, esc, HttpError } from './lib.js';
import { featureOn } from './courses.js';
import { removeUploads } from './uploads.js';
import { checkTurnstile, turnstileKeys } from './signup.js';

export const APPLY_BASE = -1000000000; // 수정 요청(-요청번호, 작은 음수) · 프로필 사진(-20억 − 회원번호) 과 겹치지 않는다

// ───────── 신청서 항목 (구글 폼 그대로, 순서도 같게) ─────────
export const FORM = {
  intro: [
    '모든 항목은 꼭 적어야 합니다. 해당 사항이 없으면 \'없음\'이라고 적어 주세요.',
    '마지막 단계에서 아래 서류 4가지를 올려 주세요. 휴대폰으로 찍은 사진도 됩니다.',
    '① 주민등록등본 ② 지난 학기 성적증명서 ③ 학생 사진(규격 없음) ④ 통장 사본',
    '※ 서류가 하나라도 빠지면 지원이 자동으로 취소됩니다.',
    '※ 주민등록번호 뒷자리 7자리는 가리고 올려 주세요.',
  ],
  sections: [
    { key: 'basic', title: '학생 기본정보', desc: '학생의 기본정보를 적어 주세요.', fields: [
      { k: 'dept', label: '학과' },
      { k: 'name', label: '성명', prefill: 'name' },
      { k: 'student_no', label: '학번', mode: 'numeric' },
      { k: 'status', label: '현재 상태', type: 'radio', options: ['재학생', '휴학생'] },
      { k: 'gpa', label: '지난 학기 성적', ph: '예: 3.5', mode: 'decimal' },
      { k: 'role', label: '직분', ph: '예: 소순장, 중순장, 대순장' },
      { k: 'ministry', label: '사역 직분', ph: '예: 없음, 캠퍼스 대표순장' },
      { k: 'church', label: '소속 교회', hint: '교단까지 정확히 적어 주세요.', ph: '예: 대한예수교장로회(합동) ○○교회' },
      { k: 'training', label: '사랑방 훈련 기간', ph: '예: 없음, 2015.04~현재' },
      { k: 'mobile', label: '휴대폰', type: 'tel', prefill: 'mobile', ph: '010-0000-0000' },
      { k: 'address', label: '현재 거주지 주소', wide: true },
    ] },
    { key: 'payer', title: '학비 부담자 정보', desc: '학비를 부담하는 분의 정보를 적어 주세요.', fields: [
      { k: 'payer_name', label: '학비 부담자 성명' },
      { k: 'payer_relation', label: '지원자와의 관계', ph: '예: 부, 모, 본인' },
      { k: 'payer_job', label: '학비 부담자 직업' },
      { k: 'payer_work', label: '학비 부담자 근무처' },
      { k: 'payer_address', label: '자택 주소', wide: true },
    ] },
    { key: 'family', title: '가정 환경 정보', desc: '가정 환경을 적어 주세요.', fields: [
      { k: 'family', label: '가족 관계', ph: '예: 1부, 1모, 2남 1녀 중 1째', wide: true },
      { k: 'housing', label: '주거 형태', type: 'radio', options: ['자가', '전세', '월세'] },
      { k: 'housing_detail', label: '세부 주거 형태', ph: '예: 자가 32평, 전세 2억, 월세 100만 원' },
    ] },
    { key: 'reason', title: '장학금 신청 사유', desc: 'A4 반 페이지(약 600자) 이상 구체적으로 적어 주세요. 분량이 모자라면 지원하지 않은 것으로 봅니다.', fields: [
      { k: 'reason', label: '지원 사유', type: 'textarea', target: 600, wide: true },
    ] },
  ],
  files: [
    { k: 'resident', label: '주민등록등본', hint: '주민등록번호 뒷자리 7자리는 가려 주세요.' },
    { k: 'grades', label: '지난 학기 성적증명서' },
    { k: 'photo', label: '학생 사진', hint: '규격은 없습니다.' },
    { k: 'bank', label: '통장 사본' },
  ],
};
const FIELDS = FORM.sections.flatMap((s) => s.fields);
const MAX_FILES = 3; // 서류마다 (등본처럼 여러 장일 수 있다)
export const STATUS = { SUBMITTED: '접수', CHECKED: '서류 확인', SELECTED: '선정', REJECTED: '미선정' };

// ───────── 날짜 (한국 시간, 하루 단위) ─────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
const WD = '일월화수목금토';
export const dayLabel = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일(${WD[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]})`; };
export const periodLabel = (r) => `${dayLabel(r.starts_on)} ~ ${dayLabel(r.ends_on)}`;
const fmtTime = (ms) => { const d = new Date(ms + 9 * 3600000).toISOString(); return `${d.slice(0, 10).replace(/-/g, '.')} ${d.slice(11, 16)}`; };

export const applyOn = (db, site) => featureOn(db, site, 'apply');
// 지금 열린 회차 (기간이 겹치면 늦게 시작한 것) · 다음에 열릴 회차
export async function openRound(db, site) {
  const t = kstDay();
  return db.prepare('SELECT * FROM apply_rounds WHERE site = ? AND deleted_at IS NULL AND visible = 1 AND starts_on <= ? AND ends_on >= ? ORDER BY starts_on DESC, id DESC LIMIT 1').bind(site, t, t).first();
}
const nextRound = (db, site) => db.prepare('SELECT * FROM apply_rounds WHERE site = ? AND deleted_at IS NULL AND visible = 1 AND starts_on > ? ORDER BY starts_on, id LIMIT 1').bind(site, kstDay()).first();
const parse = (s, d) => { try { return JSON.parse(s || '') ?? d; } catch { return d; } };

async function filesOf(db, site, ids) {
  const list = [...new Set(ids)].filter((x) => /^[0-9a-f]{32}$/.test(x));
  if (!list.length) return [];
  const { results } = await db.prepare(`SELECT id, name, mime, size, created_by, post_id FROM uploads WHERE site = ? AND kind = 'APPLY' AND id IN (${list.map(() => '?').join(',')})`).bind(site, ...list).all();
  return results;
}
const fileOut = (u) => ({ id: u.id, name: u.name, mime: u.mime, size: u.size, url: `/xms/upload/${u.id}` });
// 신청서의 서류: { 항목: [파일…] } — 지워진 파일은 빠진다
async function docsOf(db, site, app) {
  const map = parse(app.files, {});
  const found = new Map((await filesOf(db, site, Object.values(map).flat())).map((u) => [u.id, u]));
  return Object.fromEntries(FORM.files.map((f) => [f.k, (map[f.k] || []).filter((id) => found.has(id)).map((id) => fileOut(found.get(id)))]));
}

// ───────── 방문자 ─────────
//   POST /xms-api/apply  { round, answers, files: { 항목: [id…] }, turnstile }
export async function publicApply(ctx) {
  const { request, env, site, me } = ctx;
  const db = env.DB;
  if (request.method !== 'POST') throw notFound();
  if (!(await applyOn(db, site))) throw notFound('이 사이트는 신청서를 받지 않습니다.');
  if (me.kind !== 'member') throw new HttpError(401, '회원가입 · 로그인을 한 뒤 신청할 수 있습니다.');
  const raw = await body(request);
  const round = await openRound(db, site);
  if (!round || round.id !== Number(raw.round)) throw bad('지금은 신청 기간이 아닙니다. 화면을 새로 고쳐 주세요.');
  await checkTurnstile(env, request, raw.turnstile, (await turnstileKeys(env, site)).secret);

  const a = raw.answers || {};
  const answers = {};
  for (const f of FIELDS) {
    const v = str(a[f.k], f.type === 'textarea' ? 8000 : 300);
    if (!v) throw bad(`'${f.label}' 을(를) 적어 주세요.`);
    if (f.type === 'radio' && !f.options.includes(v)) throw bad(`'${f.label}' 을(를) 골라 주세요.`);
    answers[f.k] = v;
  }
  if (!raw.agree) throw bad('개인정보 수집 · 이용에 동의해 주세요.');

  const cur = await db.prepare('SELECT * FROM applications WHERE site = ? AND round_id = ? AND member_id = ?').bind(site, round.id, me.member.id).first();
  const owner = cur ? APPLY_BASE - cur.id : null;
  const want = {};
  for (const f of FORM.files) want[f.k] = [...new Set((Array.isArray(raw.files?.[f.k]) ? raw.files[f.k] : []).map(String))].slice(0, MAX_FILES);
  const found = new Map((await filesOf(db, site, Object.values(want).flat()))
    .filter((u) => u.created_by === me.member.id && (u.post_id === null || u.post_id === owner)).map((u) => [u.id, u]));
  const files = {};
  for (const f of FORM.files) {
    files[f.k] = want[f.k].filter((id) => found.has(id));
    if (!files[f.k].length) throw bad(`서류 '${f.label}' 을(를) 올려 주세요.${want[f.k].length ? ' (올린 지 오래돼 지워졌습니다. 다시 올려 주세요.)' : ''}`);
  }
  const t = now();
  let id;
  if (cur) {
    id = cur.id;
    await db.prepare('UPDATE applications SET answers = ?, files = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(answers), JSON.stringify(files), t, id).run();
  } else {
    const r = await db.prepare(`INSERT INTO applications (site, round_id, member_id, answers, files, status, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'SUBMITTED', '', ?, ?)`)
      .bind(site, round.id, me.member.id, JSON.stringify(answers), JSON.stringify(files), t, t).run();
    id = r.meta.last_row_id;
  }
  const keep = Object.values(files).flat();
  await db.prepare(`UPDATE uploads SET post_id = ? WHERE site = ? AND kind = 'APPLY' AND id IN (${keep.map(() => '?').join(',')})`).bind(APPLY_BASE - id, site, ...keep).run();
  await removeUploads(env, site, `post_id = ? AND id NOT IN (${keep.map(() => '?').join(',')})`, [APPLY_BASE - id, ...keep]); // 바꿔 올려 빠진 서류
  return json({ ok: true, id, updated: !!cur });
}

// /member/apply 화면 (public.js 의 page · needLogin 을 받아 쓴다)
export async function applyPage(ctx, { page, needLogin, msgPage }) {
  const { env, site, me } = ctx;
  const db = env.DB;
  if (!(await applyOn(db, site))) return msgPage(ctx, '페이지가 없습니다', '주소를 다시 확인해 주세요.', '', 404);
  let round = await openRound(db, site);
  const adminLink = me.level === 1 ? '<p class="ap-admin"><a href="/xms/#/apply">관리 화면에서 신청서 보기 →</a></p>' : '';
  // 관리자 미리보기: 신청 기간이 아니어도 화면을 끝까지 넘겨 볼 수 있다 (내기는 안 됨)
  const preview = !round && me.level === 1 && me.kind === 'member' && ctx.url.searchParams.get('preview') === '1';
  if (preview) round = (await nextRound(db, site)) || (await db.prepare('SELECT * FROM apply_rounds WHERE site = ? AND deleted_at IS NULL ORDER BY starts_on DESC LIMIT 1').bind(site).first());
  if (!round) {
    const next = await nextRound(db, site);
    return page(ctx, '장학금 신청', `<section class="mb wide ap">
  <div class="mb-card center">
    <header class="mb-head"><span class="mb-ico">${CAL}</span><h1>지금은 신청 기간이 아닙니다</h1>
      <p>${next ? `다음 신청 기간은 <b>${esc(periodLabel(next))}</b> 입니다.` : '신청 기간이 정해지면 홈페이지에 알려 드립니다.'}</p></header>
    <div class="mb-acts"><a class="btn" href="/">홈으로</a>${me.level === 1 && me.kind === 'member' ? '<a class="btn primary" href="/member/apply?preview=1">관리자 미리보기</a>' : ''}</div>
  </div>${adminLink}</section>`, { noindex: true });
  }
  const period = periodLabel(round);
  if (me.kind !== 'member') {
    return page(ctx, round.title, `<section class="mb wide ap">
  <div class="mb-card center">
    <header class="mb-head"><span class="mb-ico">${DOC}</span><h1>${esc(round.title)}</h1><p>신청 기간 <b>${esc(period)}</b></p></header>
    <p class="mb-lede">장학금은 <b>회원가입 · 로그인</b>을 한 뒤 신청할 수 있습니다.<br>처음이면 회원가입부터 해 주세요.</p>
    <div class="mb-acts"><a class="btn primary" href="/member/signup">회원가입</a><a class="btn" href="/member/login?next=${encodeURIComponent('/member/apply')}">로그인</a></div>
  </div></section>`, { noindex: true });
  }
  const cur = preview ? null : await db.prepare('SELECT * FROM applications WHERE site = ? AND round_id = ? AND member_id = ?').bind(site, round.id, me.member.id).first();
  const ans = cur ? parse(cur.answers, {}) : {};
  const docs = cur ? await docsOf(db, site, cur) : {};
  const m = me.member;
  const val = (f) => ans[f.k] ?? (f.prefill ? m[f.prefill] || '' : '');
  const tk = (await turnstileKeys(env, site)).sitekey;
  const notice = String(round.notice || '').trim() ? round.notice.split('\n') : FORM.intro;
  const steps = ['안내', ...FORM.sections.map((s) => s.title.replace(/ 정보$/, '')), '서류', '확인'];

  const fieldHtml = (f) => {
    const head = `<span>${esc(f.label)} <em class="req">*</em></span>`;
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    if (f.type === 'radio') {
      return `<fieldset class="field${f.wide ? ' wide' : ''}" data-group="${f.k}" data-required><legend>${esc(f.label)} <em class="req">*</em></legend>
        <div class="ap-seg">${f.options.map((o) => `<label><input type="radio" name="${f.k}" value="${esc(o)}"${val(f) === o ? ' checked' : ''} required><span>${esc(o)}</span></label>`).join('')}</div>${hint}</fieldset>`;
    }
    if (f.type === 'textarea') {
      return `<label class="field wide">${head}<textarea class="input ap-long" name="${f.k}" required maxlength="8000" data-target="${f.target}" placeholder="신청 사유를 자세히 적어 주세요.">${esc(val(f))}</textarea>
        <small class="ap-count" data-count-for="${f.k}"></small>${hint}</label>`;
    }
    const type = f.type === 'tel' ? 'tel' : 'text';
    return `<label class="field${f.wide ? ' wide' : ''}">${head}<input class="input" type="${type}" name="${f.k}" value="${esc(val(f))}" required maxlength="300"${f.mode ? ` inputmode="${f.mode}"` : ''}${f.ph ? ` placeholder="${esc(f.ph)}"` : ''}${f.k === 'name' ? ' autocomplete="name"' : f.k === 'mobile' ? ' autocomplete="tel"' : ' autocomplete="off"'}>${hint}</label>`;
  };
  const fileBox = (f) => `<div class="ap-file" data-file="${f.k}">
      <div class="ap-file-h"><b>${esc(f.label)} <em class="req">*</em></b>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>
      <ul class="ap-file-list" data-list>${(docs[f.k] || []).map((u) => `<li data-id="${u.id}" data-name="${esc(u.name)}" data-mime="${esc(u.mime)}" data-size="${u.size}"></li>`).join('')}</ul>
      <label class="btn ap-file-btn"><input type="file" accept="image/*,application/pdf" multiple hidden data-pick>${CLIP}<span>파일 올리기</span></label>
    </div>`;

  return page(ctx, round.title, `<section class="mb wide ap" data-apply data-round="${round.id}" data-user="${m.id}"${cur ? ' data-done' : ''}${preview ? ' data-preview' : ''}>
  <header class="ap-top">
    <p class="ap-eyebrow">신청 기간 ${esc(period)}</p>
    <h1>${esc(round.title)}</h1>
  </header>
  ${preview ? '<p class="ap-preview">관리자 미리보기입니다. 신청 기간이 아니어서 [신청서 내기]는 되지 않습니다.</p>' : ''}
  ${cur ? `<div class="mb-card ap-done" data-done-card>
    <span class="ap-done-ico" aria-hidden="true">${CHECK}</span>
    <div><b>신청서가 접수됐습니다</b><p>${fmtTime(cur.created_at)} 접수${cur.updated_at > cur.created_at + 60000 ? ` · ${fmtTime(cur.updated_at)} 고침` : ''}${cur.status === 'CHECKED' ? ' · 서류 확인 완료' : ''}</p>
      <p class="ap-sub">신청 기간(${esc(dayLabel(round.ends_on))}까지)에는 신청서를 고칠 수 있습니다.</p></div>
    <button type="button" class="btn" data-edit>신청서 고치기</button>
  </div>` : ''}
  <form class="mb-form ap-form" data-form="apply" novalidate${cur ? ' hidden' : ''}>
    <ol class="ap-steps" aria-label="신청 단계">${steps.map((s, i) => `<li data-dot="${i}"><i></i><span>${esc(s)}</span></li>`).join('')}</ol>
    <p class="ap-now" aria-live="polite"><b data-now-no>1</b> / ${steps.length} · <span data-now-t>${steps[0]}</span></p>

    <div class="mb-card ap-step" data-step="0">
      <h2 class="ap-h">꼭 읽어 주세요</h2>
      <ul class="ap-notice">${notice.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <label class="check ap-agree"><input type="checkbox" name="agree" value="1"${cur ? ' checked' : ''}> <span>개인정보 수집 · 이용에 동의합니다. <small>적은 정보와 서류는 장학생 선발 심사에만 씁니다.</small></span></label>
    </div>
    ${FORM.sections.map((s, i) => `<div class="mb-card ap-step" data-step="${i + 1}" hidden>
      <h2 class="ap-h">${esc(s.title)}</h2><p class="ap-desc">${esc(s.desc)}</p>
      <div class="ap-grid">${s.fields.map(fieldHtml).join('')}</div>
    </div>`).join('')}
    <div class="mb-card ap-step" data-step="${FORM.sections.length + 1}" hidden>
      <h2 class="ap-h">서류 제출</h2><p class="ap-desc">서류마다 파일을 올려 주세요(사진 · PDF, 서류마다 ${MAX_FILES}개까지). 사진은 자동으로 작게 줄여서 올립니다.</p>
      <div class="ap-files">${FORM.files.map(fileBox).join('')}</div>
    </div>
    <div class="mb-card ap-step" data-step="${FORM.sections.length + 2}" hidden>
      <h2 class="ap-h">마지막으로 확인해 주세요</h2><p class="ap-desc">고칠 곳이 있으면 [고치기]를 누르세요.</p>
      <div class="ap-review" data-review></div>
      ${tk ? `<div class="ap-bot"><div class="cf-turnstile" data-sitekey="${esc(tk)}" data-language="ko" data-size="flexible"></div></div>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ''}
    </div>

    <p class="err" role="alert"></p>
    <div class="ap-nav">
      <button type="button" class="btn" data-prev hidden>이전</button>
      <button type="button" class="btn primary" data-next>다음</button>
      <button type="submit" class="btn primary" data-submit hidden>${cur ? '고친 내용으로 다시 내기' : '신청서 내기'}</button>
    </div>
    <p class="mb-note ap-save">적은 내용은 이 기기에 자동으로 임시 저장됩니다.</p>
  </form>
  <script type="application/json" data-apply-form>${JSON.stringify({ sections: FORM.sections.map((s) => ({ title: s.title, fields: s.fields.map((f) => ({ k: f.k, label: f.label, type: f.type || 'text', target: f.target })) })), files: FORM.files.map((f) => ({ k: f.k, label: f.label })), max: MAX_FILES }).replace(/</g, '\\u003c')}</script>
  ${adminLink}
</section>`, { noindex: true });
}

const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const DOC = svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>');
const CAL = svg('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>');
const CHECK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
const CLIP = svg('<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>');

// ───────── 관리자 ─────────
const roundOut = (r, n = 0) => ({ id: r.id, title: r.title, starts_on: r.starts_on, ends_on: r.ends_on, notice: r.notice || '', visible: !!r.visible, period: periodLabel(r), count: n,
  state: !r.visible ? 'hidden' : r.starts_on > kstDay() ? 'soon' : r.ends_on < kstDay() ? 'closed' : 'open' });
function roundValues(b) {
  const title = str(b.title, 100);
  const s = str(b.starts_on, 10); const e = str(b.ends_on, 10);
  if (!title) throw bad('제목을 적어 주세요.');
  if (!DATE_RE.test(s) || !DATE_RE.test(e)) throw bad('신청 기간(시작일 · 마감일)을 골라 주세요.');
  if (s > e) throw bad('마감일이 시작일보다 앞설 수 없습니다.');
  return { title, s, e, notice: str(b.notice, 3000), visible: b.visible === false || b.visible === '0' ? 0 : 1 };
}
const appRow = (a) => {
  const v = parse(a.answers, {});
  return { id: a.id, round_id: a.round_id, name: v.name || a.m_name || '', dept: v.dept || '', student_no: v.student_no || '', gpa: v.gpa || '', state: v.status || '',
    role: v.role || '', mobile: v.mobile || '', status: a.status, created_at: a.created_at, updated_at: a.updated_at, login_id: a.login_id || '' };
};

export async function adminApply(ctx, path, method) {
  const { request, env, site, me, url } = ctx;
  const db = env.DB;
  let m;
  if (!path.startsWith('/apply')) return null;
  if (!(await applyOn(db, site))) throw notFound('이 사이트는 신청서 기능을 쓰지 않습니다.');

  // 신청 기간(회차)
  if (path === '/apply/rounds' && method === 'GET') {
    const { results } = await db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM applications a WHERE a.round_id = r.id) AS n FROM apply_rounds r
      WHERE r.site = ? AND r.deleted_at IS NULL ORDER BY r.starts_on DESC, r.id DESC`).bind(site).all();
    return json({ rounds: results.map((r) => roundOut(r, r.n)), today: kstDay(), intro: FORM.intro.join('\n') });
  }
  if (path === '/apply/rounds' && method === 'POST') {
    const v = roundValues(await body(request));
    const t = now();
    const r = await db.prepare('INSERT INTO apply_rounds (site, title, starts_on, ends_on, notice, visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(site, v.title, v.s, v.e, v.notice, v.visible, t, t).run();
    await audit(db, site, me, request, 'APPLY_ROUND_CREATE', v.title, `${v.s} ~ ${v.e}`);
    return json({ id: r.meta.last_row_id });
  }
  if ((m = path.match(/^\/apply\/rounds\/(\d+)$/))) {
    const r = await db.prepare('SELECT * FROM apply_rounds WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!r) throw notFound('없는 신청 기간입니다.');
    if (method === 'PUT') {
      const v = roundValues(await body(request));
      await db.prepare('UPDATE apply_rounds SET title = ?, starts_on = ?, ends_on = ?, notice = ?, visible = ?, updated_at = ? WHERE id = ?').bind(v.title, v.s, v.e, v.notice, v.visible, now(), r.id).run();
      await audit(db, site, me, request, 'APPLY_ROUND_UPDATE', v.title, `${v.s} ~ ${v.e}`);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      const n = await db.prepare('SELECT COUNT(*) AS n FROM applications WHERE round_id = ?').bind(r.id).first();
      if (n.n) throw bad(`이 기간에 들어온 신청서가 ${n.n}개 있어 지울 수 없습니다. 홈페이지에서 감추려면 '감추기'로 바꾸세요.`);
      await db.prepare('UPDATE apply_rounds SET deleted_at = ? WHERE id = ?').bind(now(), r.id).run();
      await audit(db, site, me, request, 'APPLY_ROUND_DELETE', r.title);
      return json({ ok: true });
    }
  }

  // 신청서 목록 · 엑셀
  if ((path === '/apply/list' || path === '/apply/export') && method === 'GET') {
    const round = Number(url.searchParams.get('round')) || 0;
    const { results } = await db.prepare(`SELECT a.*, mb.name AS m_name, mb.login_id FROM applications a LEFT JOIN members mb ON mb.id = a.member_id
      WHERE a.site = ? AND a.round_id = ? ORDER BY a.created_at DESC`).bind(site, round).all();
    if (path === '/apply/list') return json(results.map(appRow));
    const r = await db.prepare('SELECT title FROM apply_rounds WHERE id = ? AND site = ?').bind(round, site).first();
    const head = ['번호', '상태', '접수 시각', '고친 시각', '아이디', ...FIELDS.map((f) => f.label), ...FORM.files.map((f) => `${f.label} (파일 수)`), '메모'];
    const lines = results.map((a) => {
      const v = parse(a.answers, {}); const fl = parse(a.files, {});
      return [a.id, STATUS[a.status] || a.status, fmtTime(a.created_at), fmtTime(a.updated_at), a.login_id || '', ...FIELDS.map((f) => v[f.k] || ''), ...FORM.files.map((f) => (fl[f.k] || []).length), a.memo || ''];
    });
    const cell = (x) => { const s = String(x ?? ''); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };
    const csv = `\ufeff${[head, ...lines].map((l) => l.map(cell).join(',')).join('\r\n')}`;
    await audit(db, site, me, request, 'APPLY_EXPORT', r?.title || '', `${results.length}건`);
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="applications-${round}-${kstDay()}.csv"`, 'Cache-Control': 'no-store' } });
  }

  // 신청서 하나
  if ((m = path.match(/^\/apply\/(\d+)$/))) {
    const a = await db.prepare('SELECT a.*, mb.name AS m_name, mb.login_id, mb.email AS m_email FROM applications a LEFT JOIN members mb ON mb.id = a.member_id WHERE a.id = ? AND a.site = ?').bind(+m[1], site).first();
    if (!a) throw notFound('없는 신청서입니다.');
    if (method === 'GET') {
      const r = await db.prepare('SELECT * FROM apply_rounds WHERE id = ?').bind(a.round_id).first();
      const { results: ids } = await db.prepare('SELECT id FROM applications WHERE site = ? AND round_id = ? ORDER BY created_at DESC').bind(site, a.round_id).all();
      const i = ids.findIndex((x) => x.id === a.id);
      return json({
        ...appRow(a), memo: a.memo || '', answers: parse(a.answers, {}), docs: await docsOf(db, site, a), email: a.m_email || '',
        round: r ? roundOut(r) : null, prev: ids[i - 1]?.id || null, next: ids[i + 1]?.id || null, no: i + 1, total: ids.length,
        form: { sections: FORM.sections.map((s) => ({ title: s.title, fields: s.fields.map((f) => ({ k: f.k, label: f.label, type: f.type || 'text' })) })), files: FORM.files.map((f) => ({ k: f.k, label: f.label })) },
        statuses: STATUS,
      });
    }
    if (method === 'PUT') {
      const b = await body(request);
      const status = b.status !== undefined ? String(b.status) : a.status;
      if (!STATUS[status]) throw bad('상태를 알 수 없습니다.');
      const memo = b.memo !== undefined ? str(b.memo, 2000) : a.memo;
      await db.prepare('UPDATE applications SET status = ?, memo = ? WHERE id = ?').bind(status, memo, a.id).run();
      if (status !== a.status) await audit(db, site, me, request, 'APPLY_STATUS', appRow(a).name, STATUS[status]);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await removeUploads(env, site, 'post_id = ?', [APPLY_BASE - a.id]);
      await db.prepare('DELETE FROM applications WHERE id = ?').bind(a.id).run();
      await audit(db, site, me, request, 'APPLY_DELETE', appRow(a).name);
      return json({ ok: true });
    }
  }
  return null;
}

// 서류 파일을 열어 볼 수 있는 사람: 관리자 · 올린 본인
export const canSeeApplyFile = (u, me) => me.level === 1 || (me.kind === 'member' && u.created_by === me.member.id);
