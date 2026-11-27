// 상담연락 문자 보내기 (사용자 지시 2026-11-27) — 네이버 클라우드 SENS
//   고른 업체마다 문장을 따로 만든다: {업체명} → 그 업체 이름. 광고면 맨 앞 "(광고)" + 끝에 무료 수신거부 080 번호.
//   정보통신망법 제50조: 수신 동의(leads.consent)한 곳에만 보낸다 — 동의 없는 곳은 서버가 빼고 알려 준다. 광고는 밤 9시 ~ 아침 8시(한국 시각) 막음.
//   키는 Worker 비밀값 NCP_ACCESS_KEY · NCP_SECRET_KEY, 나머지(서비스 ID · 발신번호 · 080 번호)는 settings.lead_sms_cfg.

const SENS = 'https://sens.apigw.ntruss.com';
export const SMS_MAX = 80;      // SENS SMS 최대 바이트(EUC-KR 기준 — 한글 2 · 그 밖 1)
export const LMS_MAX = 2000;
export const PRICE = { SMS: 9, LMS: 30 };   // 원(부가세 별도), 2026-11-27 네이버 클라우드 요금표

export const bytes = (s) => { let n = 0; for (const ch of String(s)) n += ch.charCodeAt(0) > 127 ? 2 : 1; return n; };
const digits = (s) => String(s || '').replace(/\D/g, '');

// 한 업체에게 갈 문장(미리보기와 실제 보내기가 같은 함수를 쓴다)
export function compose(tpl, lead, { ad, optout }) {
  let t = String(tpl || '').replace(/\{업체명\}/g, lead.name || '').replace(/\r\n/g, '\n').trim();
  if (ad) {
    if (!/^\(광고\)/.test(t)) t = '(광고)' + t;
    const stop = `무료수신거부 ${optout}`;
    if (!t.includes(stop)) t += `\n${stop}`;
  }
  return t;
}
export const kindOf = (text) => (bytes(text) <= SMS_MAX ? 'SMS' : 'LMS');

export const kstHour = (t = Date.now()) => new Date(t + 9 * 3600000).getUTCHours();
export const nightBlocked = (t) => { const h = kstHour(t); return h >= 21 || h < 8; };

async function sign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// 같은 종류(SMS/LMS)끼리 100명씩 한 번에 — 받는 사람마다 내용은 따로(messages[].content)
async function sensSend(env, cfg, type, ad, msgs) {
  const path = `/sms/v2/services/${encodeURIComponent(cfg.serviceId)}/messages`;
  const ts = String(Date.now());
  const res = await fetch(SENS + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-ncp-apigw-timestamp': ts,
      'x-ncp-iam-access-key': keyOf(env, cfg).ak,
      'x-ncp-apigw-signature-v2': await sign(keyOf(env, cfg).sk, `POST ${path}\n${ts}\n${keyOf(env, cfg).ak}`),
    },
    body: JSON.stringify({
      type, contentType: ad ? 'AD' : 'COMM', countryCode: '82', from: digits(cfg.from),
      ...(type === 'LMS' ? { subject: cfg.subject || '안내' } : {}),
      content: msgs[0].content,
      messages: msgs.map((m) => ({ to: digits(m.phone), content: m.content, ...(type === 'LMS' ? { subject: cfg.subject || '안내' } : {}) })),
    }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.status === 202 && j.statusCode === '202', status: res.status, requestId: j.requestId || '', error: j.statusName || j.error?.message || j.errorMessage || `HTTP ${res.status}` };
}

// 키: Worker 비밀값(NCP_ACCESS_KEY · NCP_SECRET_KEY)이 있으면 그것, 없으면 xim 문자 설정에서 넣은 값(settings.lead_sms_cfg — 화면에는 다시 보여 주지 않음)
export const keyOf = (env, cfg) => ({ ak: env.NCP_ACCESS_KEY || cfg.ak || '', sk: env.NCP_SECRET_KEY || cfg.sk || '' });
export const cfgReady = (env, cfg) => ({
  keys: !!(keyOf(env, cfg).ak && keyOf(env, cfg).sk),
  service: !!cfg.serviceId, from: !!digits(cfg.from), optout: !!digits(cfg.optout),
});

// leads = [{id, name, phone, consent}] — 동의 · 번호 없는 곳은 빼고, 나머지를 보낸 뒤 줄마다 결과
export async function sendLeads(env, cfg, leads, { text, ad }) {
  const r = cfgReady(env, cfg);
  if (!r.keys) throw new Error('네이버 클라우드 API 키가 아직 없습니다. 문자 설정에 넣어 주세요.');
  if (!r.service || !r.from) throw new Error('문자 설정(서비스 ID · 발신번호)을 먼저 넣어 주세요.');
  if (ad && !r.optout) throw new Error('광고 문자에는 무료 수신거부 080 번호가 꼭 있어야 합니다. 문자 설정에 넣어 주세요.');
  if (ad && nightBlocked()) throw new Error('광고 문자는 밤 9시부터 아침 8시까지 보낼 수 없습니다(정보통신망법).');
  if (!String(text || '').trim()) throw new Error('문자 내용이 비어 있습니다.');
  const skipped = []; const groups = { SMS: [], LMS: [] };
  for (const l of leads) {
    if (!/^01[016789]\d{7,8}$/.test(digits(l.phone))) { skipped.push({ id: l.id, name: l.name, why: '휴대폰 번호 없음' }); continue; }
    if (!l.consent) { skipped.push({ id: l.id, name: l.name, why: '수신 동의 없음' }); continue; }
    const content = compose(text, l, { ad, optout: cfg.optout });
    if (bytes(content) > LMS_MAX) { skipped.push({ id: l.id, name: l.name, why: '너무 긺(2,000바이트 넘음)' }); continue; }
    groups[kindOf(content)].push({ id: l.id, name: l.name, phone: l.phone, content });
  }
  const results = [];
  for (const type of ['SMS', 'LMS']) {
    const g = groups[type];
    for (let i = 0; i < g.length; i += 100) {
      const part = g.slice(i, i + 100);
      let out;
      try { out = await sensSend(env, cfg, type, ad, part); } catch (e) { out = { ok: false, error: String(e?.message || e) }; }
      for (const m of part) results.push({ ...m, type, ok: out.ok, requestId: out.requestId || '', error: out.ok ? '' : out.error });
    }
  }
  return { results, skipped };
}
