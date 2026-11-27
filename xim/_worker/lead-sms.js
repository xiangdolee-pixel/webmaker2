// 상담연락 문자 보내기 (사용자 지시 2026-11-27) — 네이버 클라우드 SENS
//   고른 업체마다 문장을 따로 만든다: {업체명} → 그 업체 이름. 광고면 맨 앞 "(광고)" + 끝에 무료 수신거부 080 번호.
//   정보통신망법 제50조: 수신 동의(leads.consent)한 곳에만 보낸다 — 동의 없는 곳은 서버가 빼고 알려 준다. 광고는 밤 9시 ~ 아침 8시(한국 시각) 막음.
//   키는 Worker 비밀값 NCP_ACCESS_KEY · NCP_SECRET_KEY, 나머지(서비스 ID · 발신번호 · 080 번호)는 settings.lead_sms_cfg.

const SENS = 'https://sens.apigw.ntruss.com';
export const SMS_MAX = 80;      // SENS SMS 최대 바이트(EUC-KR 기준 — 한글 2 · 그 밖 1)
export const LMS_MAX = 2000;
// 원(부가세 별도). sens = 네이버 클라우드 요금표(2026-11-27), hackle = 핵클 문서 프로모션가(첫 충전 한 달은 SMS 7.3 · LMS 23.7)
export const PRICES = { solapi: { SMS: 18, LMS: 45 }, sens: { SMS: 9, LMS: 30 }, hackle: { SMS: 10, LMS: 33 } };
// 기본 = 네이버 클라우드 SENS — 고정 IP 없이 xim(Cloudflare)에서 되는 곳. 핵클 · 솔라피는 문자 API 허용 IP 필수라 중계 서버 없이는 못 씀(2026-11-27 확인)
export const providerOf = (cfg) => (['solapi', 'hackle'].includes(cfg.provider) ? cfg.provider : 'sens');
export const SOLAPI_080 = '080-500-4233';   // 솔라피 공용 무료 수신거부 번호
export const optoutOf = (cfg) => cfg.optout || (providerOf(cfg) === 'solapi' ? SOLAPI_080 : '');
export const PRICE = PRICES.sens;

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
export const hackleKey = (env, cfg) => env.HACKLE_API_KEY || cfg.hk || '';
export const solapiKey = (env, cfg) => ({ k: env.SOLAPI_API_KEY || cfg.sak || '', s: env.SOLAPI_API_SECRET || cfg.sas || '' });
export const cfgReady = (env, cfg) => providerOf(cfg) === 'solapi'
  ? { keys: !!(solapiKey(env, cfg).k && solapiKey(env, cfg).s), service: true, from: !!digits(cfg.from), optout: !!digits(optoutOf(cfg)) }
  : providerOf(cfg) === 'hackle'
  ? { keys: !!hackleKey(env, cfg), service: true, from: !!digits(cfg.from), optout: !!digits(cfg.optout) }
  : { keys: !!(keyOf(env, cfg).ak && keyOf(env, cfg).sk), service: !!cfg.serviceId, from: !!digits(cfg.from), optout: !!digits(cfg.optout) };

// 솔라피 API v4 — HMAC-SHA256(date + salt) 서명, 한 번에 여러 명 · 받는 사람마다 내용 따로
async function solapiSend(env, cfg, msgs) {
  const { k, s: secret } = solapiKey(env, cfg);
  const date = new Date().toISOString(); const salt = crypto.randomUUID().replace(/-/g, '');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(date + salt)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `HMAC-SHA256 apiKey=${k}, date=${date}, salt=${salt}, signature=${sig}` },
    body: JSON.stringify({ messages: msgs.map((m) => ({ to: digits(m.phone), from: digits(cfg.from), text: m.content, type: m.type, ...(m.type === 'LMS' ? { subject: cfg.subject || '안내' } : {}) })) }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return msgs.map(() => ({ ok: false, error: j.errorMessage || j.errorCode || `HTTP ${res.status}` }));
  const failed = new Map((j.failedMessageList || []).map((f) => [String(f.to), f.statusMessage || f.statusCode || '실패']));
  return msgs.map((m) => { const e = failed.get(digits(m.phone)); return { ok: !e, requestId: j.groupInfo?.groupId || '', error: e || '' }; });
}

// 핵클 메시지 API — 한 요청에 받는 사람 1명(https://hackle.gitbook.io/hackle-docs/api/text-message.md)
async function hackleSend(env, cfg, type, ad, m) {
  const res = await fetch('https://message-api.hackle.io/v1/messages/text/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-HACKLE-API-KEY': hackleKey(env, cfg), 'X-IDEMPOTENCY-KEY': `xim-${m.id}-${m.stamp}` },
    body: JSON.stringify({ messageType: type, sender: digits(cfg.from), recipient: digits(m.phone), body: m.content, ...(type === 'LMS' ? { title: cfg.subject || '안내' } : {}), isAd: !!ad }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, requestId: j.messageId || j.id || j.data?.messageId || '', error: j.message || j.code || j.error?.message || `HTTP ${res.status}` };
}

// leads = [{id, name, phone, consent}] — 동의 · 번호 없는 곳은 빼고, 나머지를 보낸 뒤 줄마다 결과
export async function sendLeads(env, cfg, leads, { text, ad }) {
  const r = cfgReady(env, cfg);
  const pv = providerOf(cfg); const hk = pv === 'hackle';
  if (!r.keys) throw new Error(`${{ solapi: '솔라피', hackle: '핵클', sens: '네이버 클라우드' }[pv]} API 키가 아직 없습니다. 문자 설정에 넣어 주세요.`);
  if (!r.service || !r.from) throw new Error('문자 설정(발신번호)을 먼저 넣어 주세요.');
  if (ad && !r.optout) throw new Error('광고 문자에는 무료 수신거부 080 번호가 꼭 있어야 합니다. 문자 설정에 넣어 주세요.');
  if (ad && nightBlocked()) throw new Error('광고 문자는 밤 9시부터 아침 8시까지 보낼 수 없습니다(정보통신망법).');
  if (!String(text || '').trim()) throw new Error('문자 내용이 비어 있습니다.');
  const skipped = []; const groups = { SMS: [], LMS: [] };
  for (const l of leads) {
    if (!/^01[016789]\d{7,8}$/.test(digits(l.phone))) { skipped.push({ id: l.id, name: l.name, why: '휴대폰 번호 없음' }); continue; }
    if (!l.consent) { skipped.push({ id: l.id, name: l.name, why: '수신 동의 없음' }); continue; }
    const content = compose(text, l, { ad, optout: optoutOf(cfg) });
    if (bytes(content) > LMS_MAX) { skipped.push({ id: l.id, name: l.name, why: '너무 긺(2,000바이트 넘음)' }); continue; }
    groups[kindOf(content)].push({ id: l.id, name: l.name, phone: l.phone, content });
  }
  const results = [];
  if (pv === 'solapi') {
    const all = [...groups.SMS.map((m) => ({ ...m, type: 'SMS' })), ...groups.LMS.map((m) => ({ ...m, type: 'LMS' }))];
    for (let i = 0; i < all.length; i += 500) {
      const part = all.slice(i, i + 500);
      let outs; try { outs = await solapiSend(env, cfg, part); } catch (e) { outs = part.map(() => ({ ok: false, error: String(e?.message || e) })); }
      part.forEach((m, n) => results.push({ ...m, ...outs[n] }));
    }
    return { results, skipped };
  }
  if (hk) {   // 1명씩, 동시에 5개까지
    const all = [...groups.SMS.map((m) => ({ ...m, type: 'SMS' })), ...groups.LMS.map((m) => ({ ...m, type: 'LMS' }))];
    const stamp = Date.now(); let next = 0;
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (next < all.length) {
        const m = all[next++];
        let out; try { out = await hackleSend(env, cfg, m.type, ad, { ...m, stamp }); } catch (e) { out = { ok: false, error: String(e?.message || e) }; }
        results.push({ ...m, ok: out.ok, requestId: out.requestId || '', error: out.ok ? '' : out.error });
      }
    }));
    return { results, skipped };
  }
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
