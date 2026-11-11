// 회원가입 이메일 인증 (모든 xim 사이트 공통, 사용자 지시 2026-11-03)
//   ① 이메일 + 봇 확인(Cloudflare Turnstile) → 6자리 번호를 메일로 보낸다
//   ② 번호 확인 → 가입표(ticket, 30분)를 돌려준다
//   ③ /signup 은 가입표가 있어야 받는다 — 아이디 = 이메일
// 설정 (리포에 두지 않는다):
//   Turnstile: 사이트마다 xim 이 만든 위젯 키(xim DB sites.turnstile_sitekey/secret) — 없으면 봇 확인을 건너뛴다
//   메일: Cloudflare Email Service 바인딩 EMAIL(send_email) 또는 secret RESEND_API_KEY
//   보내는 주소: 그 사이트 도메인의 noreply@<도메인> (고객은 그 사이트에 가입하므로).
//     그 도메인을 아직 Email Sending 에 등록(Onboard)하지 않았으면 예비 주소 vars MAIL_FROM(noreply@plators.com)으로 보낸다.
import { HttpError, bad, now, str, esc, randomHex, clientIp, tooManyFails, recordFail } from './lib.js';

export const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
export const normEmail = (v) => str(v, 254).toLowerCase();
const CODE_TTL = 10 * 60000;      // 번호는 10분
const TICKET_TTL = 30 * 60000;    // 확인 뒤 30분 안에 가입
const RESEND_GAP = 60000;         // 다시 받기는 1분 뒤
const MAX_TRIES = 5;              // 번호 5번 틀리면 새로 받기

const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function turnstileKeys(env, site) {
  const r = await env.XIM_DB.prepare('SELECT turnstile_sitekey AS k, turnstile_secret AS s FROM sites WHERE slug = ?').bind(site).first().catch(() => null);
  return { sitekey: r?.k || '', secret: r?.s || '' };
}

export async function checkTurnstile(env, request, token, secret) {
  if (!secret) return; // 아직 설정 전이면 건너뛴다
  if (!token) throw bad('사람인지 확인하는 칸을 먼저 끝내 주세요.');
  const f = new FormData();
  f.append('secret', secret);
  f.append('response', String(token).slice(0, 2048));
  f.append('remoteip', clientIp(request));
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f }).then((x) => x.json()).catch(() => null);
  if (!r?.success) throw bad('사람인지 확인하지 못했습니다. 확인 칸을 다시 해 주세요.');
}

export const mailReady = (env) => !!(env.MAIL_FROM && (env.EMAIL || env.RESEND_API_KEY));

// 사이트 도메인 → 메일 주소용(한글 도메인은 xn-- 로)
export function siteMailFrom(domain) {
  const d = String(domain || '').trim().replace(/^https?:[/][/]/, '').replace(/[/].*$/, '');
  if (!d) return '';
  try { return `noreply@${new URL(`https://${d}`).hostname}`; } catch { return ''; }
}

async function sendOnce(env, from, { to, subject, text, html, fromName }) {
  if (env.EMAIL) {
    await env.EMAIL.send({ to, from: { email: from, name: fromName }, subject, text, html });
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, text, html }),
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${await r.text().catch(() => '')}`);
}

async function sendMail(env, msg, siteFrom) {
  if (!mailReady(env)) throw new HttpError(503, '인증 메일을 보낼 준비가 아직 안 됐습니다. 잠시 뒤에 다시 해 주세요.');
  // 사이트 주소로 먼저, 그 도메인이 아직 등록 전이면 예비 주소로
  for (const from of [...new Set([siteFrom, env.MAIL_FROM].filter(Boolean))]) {
    try { await sendOnce(env, from, msg); return from; } catch (e) { console.error('메일 보내기 실패', from, e?.message || e); }
  }
  throw new HttpError(502, '인증 메일을 보내지 못했습니다. 잠시 뒤에 다시 해 주세요.');
}

// ① 번호 보내기
export async function sendSignupCode({ env, request, site }, raw, info = {}) {
  const siteName = info.name;
  const db = env.DB;
  const ipKey = `code:${site}:${clientIp(request)}`;
  if (await tooManyFails(db, ipKey, 10)) throw new HttpError(429, '인증 메일을 너무 많이 요청했습니다. 15분 뒤에 다시 해 주세요.');
  const email = normEmail(raw.email);
  if (!EMAIL_RE.test(email)) throw bad('이메일 주소를 확인해 주세요.');
  await checkTurnstile(env, request, raw.turnstile, (await turnstileKeys(env, site)).secret);
  const dup = await db.prepare('SELECT status FROM members WHERE site = ? AND (lower(login_id) = ? OR (lower(email) = ? AND status != \'WITHDRAWN\')) ORDER BY status = \'WITHDRAWN\' LIMIT 1').bind(site, email, email).first();
  if (dup?.status === 'WITHDRAWN') throw bad('탈퇴한 이메일입니다. 다시 가입하려면 사이트 관리자에게 문의해 주세요.');
  if (dup) throw bad('이미 가입한 이메일입니다. 로그인해 주세요.');
  const cur = await db.prepare('SELECT sent_at FROM signup_codes WHERE site = ? AND email = ?').bind(site, email).first();
  if (cur && now() - cur.sent_at < RESEND_GAP) throw bad(`방금 보냈습니다. ${Math.ceil((RESEND_GAP - (now() - cur.sent_at)) / 1000)}초 뒤에 다시 받을 수 있습니다.`);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const t = now();
  await recordFail(db, ipKey); // 보낸 횟수도 같은 표로 센다 (15분에 10번까지)
  await db.prepare(`INSERT INTO signup_codes (site, email, code_hash, expires_at, tries, sent_at, ticket, ticket_until) VALUES (?, ?, ?, ?, 0, ?, '', 0)
    ON CONFLICT(site, email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, sent_at = excluded.sent_at, ticket = '', ticket_until = 0`)
    .bind(site, email, await sha(`${site}:${email}:${code}`), t + CODE_TTL, t).run();
  const name = siteName || site;
  await sendMail(env, {
    to: email,
    fromName: name,
    subject: `[${name}] 회원가입 인증번호 ${code}`,
    text: `${name} 회원가입 인증번호는 ${code} 입니다.\n10분 안에 가입 화면에 넣어 주세요.\n직접 요청하지 않았다면 이 메일은 지우셔도 됩니다.`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#191f28">
<p style="margin:0 0 8px;font-size:15px">${esc(name)} 회원가입 인증번호</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:6px">${code}</p>
<p style="margin:0;font-size:14px;color:#6b7684">10분 안에 가입 화면에 넣어 주세요.<br>직접 요청하지 않았다면 이 메일은 지우셔도 됩니다.</p></div>`,
  }, siteMailFrom(info.domain));
  return { ok: true, email, expires_in: CODE_TTL / 1000, resend_in: RESEND_GAP / 1000 };
}

// ② 번호 확인 → 가입표
export async function verifySignupCode({ env, site }, raw) {
  const db = env.DB;
  const email = normEmail(raw.email);
  const code = str(raw.code, 10).replace(/\D/g, '');
  const row = await db.prepare('SELECT * FROM signup_codes WHERE site = ? AND email = ?').bind(site, email).first();
  if (!row || !row.code_hash) throw bad('먼저 인증번호를 받아 주세요.');
  if (row.expires_at < now()) throw bad('인증번호 시간이 지났습니다. 다시 받아 주세요.');
  if (row.tries >= MAX_TRIES) throw bad(`인증번호를 ${MAX_TRIES}번 틀렸습니다. 다시 받아 주세요.`);
  if (code.length !== 6 || (await sha(`${site}:${email}:${code}`)) !== row.code_hash) {
    await db.prepare('UPDATE signup_codes SET tries = tries + 1 WHERE site = ? AND email = ?').bind(site, email).run();
    const left = MAX_TRIES - row.tries - 1;
    throw bad(left > 0 ? `인증번호가 맞지 않습니다. (${left}번 더 할 수 있습니다)` : '인증번호를 너무 많이 틀렸습니다. 다시 받아 주세요.');
  }
  const ticket = randomHex(24);
  await db.prepare("UPDATE signup_codes SET code_hash = '', ticket = ?, ticket_until = ? WHERE site = ? AND email = ?").bind(ticket, now() + TICKET_TTL, site, email).run();
  return { ok: true, email, ticket };
}

// ③ 가입할 때: 가입표가 맞는지 → 확인된 이메일
export async function takeTicket(db, site, raw) {
  const email = normEmail(raw.email);
  const ticket = str(raw.ticket, 100);
  const row = ticket ? await db.prepare('SELECT * FROM signup_codes WHERE site = ? AND email = ?').bind(site, email).first() : null;
  if (!row || !row.ticket || row.ticket !== ticket) throw bad('이메일 인증을 먼저 해 주세요.');
  if (row.ticket_until < now()) throw bad('인증한 지 30분이 지났습니다. 이메일 인증을 다시 해 주세요.');
  return { email, done: () => db.prepare('DELETE FROM signup_codes WHERE site = ? AND email = ?').bind(site, email) };
}
