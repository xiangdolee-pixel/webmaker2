// domains — 도메인 연결 도구 (Worker)
//   KT 에서 Cloudflare 무료 IP 대역은 LA 로 돌아가 수시로 크게 느려진다. 유료(Pro) 존의 IP 대역은 그런 일이 없다.
//   그래서 plators.com(유료) 존에 Cloudflare for SaaS 를 켜 두고, 다른 도메인은 "회색 CNAME → sites.plators.com" 으로
//   plators.com 의 IP 를 빌려 탄다(회사 webchon.co.kr · 6988.co.kr 과 같은 방식). 원본은 IP 대신 Worker 경로(route).
//   plators.com 하위 주소(*.plators.com)는 이 도구가 필요 없다 — 존이 유료면 그대로 유료 IP.
//
//   한 도메인의 단계: ① 사용자 지정 호스트(Custom Hostname) 등록 + Worker 경로 `<호스트>/*` → 고른 Worker
//     ② 인증서 · 소유 확인 TXT 넣기 → 인증서 Active  ③ (끊김 없게 그 뒤에) 그 도메인 DNS 를 회색 CNAME 으로 바꾸고
//     예전 Workers Custom Domain 을 뗀다  ④ 넣었던 TXT 지우기.
//   그 도메인이 이 계정 Cloudflare 에 있으면 ②~④ 를 자동으로, 다른 곳(가비아 등)이면 넣을 값을 화면에 보여 준다.
//
//   비밀값: DOMAINS_PASS(화면 비밀번호) · AGENT_TOKEN(xim 이 서비스 바인딩으로 부를 때, xim 쪽 DOMAINS_TOKEN 과 같은 값). Cloudflare API 토큰은 화면에서 붙여 넣어 KV 'token' 에 둔다.
//   API(쿠키 dm_sess): POST /api/login {pass} · POST /api/logout · GET /api/me · POST /api/token {token}
//     GET /api/status · POST /api/setup · GET /api/workers · GET /api/domains · POST /api/domains {host, www, worker}
//     POST /api/domains/:host/check · PUT /api/domains/:host {worker} · POST /api/domains/:host/revert · DELETE /api/domains/:host

const ACCOUNT_ID = 'f225d506d8cf6ddf97704a36c69f5ce7'; // xiangdolee 계정만
const SAAS_ZONE = 'plators.com';
const ENTRY = 'sites.plators.com';     // 다른 도메인이 회색 CNAME 으로 가리킬 입구
const ENTRY_IP = '100::';              // 가짜 원본(Worker 경로가 받으므로 실제로 가지 않음)
const COOKIE = 'dm_sess';
const API = 'https://api.cloudflare.com/client/v4';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const sameText = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const cookieOf = (request, name) => (request.headers.get('Cookie') || '').split(/;\s*/).map((c) => c.split('=')).find((c) => c[0] === name)?.[1] || '';
const sessionToken = (env) => hmac(env.DOMAINS_PASS, 'domains-session-v1');
async function requireUser(request, env) {
  // xim "도메인 연결" 메뉴가 서비스 바인딩으로 대신 부를 때 — xim 이 운영자 로그인을 이미 확인했다
  const agent = request.headers.get('X-Agent-Token') || '';
  if (agent && env.AGENT_TOKEN && sameText(agent, env.AGENT_TOKEN)) return;
  if (!env.DOMAINS_PASS) throw new HttpError(503, '비밀번호(DOMAINS_PASS)가 아직 설정되지 않았습니다.');
  const tok = cookieOf(request, COOKIE);
  if (!tok || !sameText(tok, await sessionToken(env))) throw new HttpError(401, '로그인이 필요합니다.');
}
async function body(request) { try { return (await request.json()) || {}; } catch { throw new HttpError(400, 'JSON 본문이 필요합니다.'); } }

// ───── Cloudflare API ─────
function client(token) {
  const call = async (method, path, data) => {
    const r = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (r.status === 204) return { success: true, result: null }; // 지우기 등 본문 없는 성공
    let out; try { out = await r.json(); } catch { throw new HttpError(502, `Cloudflare 응답을 읽지 못했습니다 (HTTP ${r.status})`); }
    if (!out.success) {
      const msg = (out.errors || []).map((e) => `${e.message}${e.code ? ` (${e.code})` : ''}`).join(', ') || `HTTP ${r.status}`;
      const err = new HttpError(r.status === 401 || r.status === 403 ? 502 : (r.status >= 500 ? 502 : 400), `Cloudflare: ${msg}`);
      err.cf = out.errors || []; throw err;
    }
    return out;
  };
  const all = async (path) => { // 여러 쪽 목록
    const list = []; const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; page <= 20; page++) {
      const out = await call('GET', `${path}${sep}page=${page}&per_page=50`);
      list.push(...(out.result || []));
      const info = out.result_info; if (!info || page >= (info.total_pages || 1)) break;
    }
    return list;
  };
  return { call, all };
}
async function cfFor(env) {
  const token = await env.KV.get('token');
  if (!token) throw new HttpError(409, 'Cloudflare API 토큰이 아직 없습니다. 화면에서 먼저 넣어 주세요.');
  return client(token);
}
async function saasZone(cf) {
  const z = (await cf.call('GET', `/zones?name=${SAAS_ZONE}&account.id=${ACCOUNT_ID}`)).result?.[0];
  if (!z) throw new HttpError(500, `${SAAS_ZONE} 존을 찾지 못했습니다.`);
  return z;
}

// 1.1.1.1 로 실제 DNS 를 본다(회색 CNAME 이 됐는지, 어느 IP 가 나가는지)
async function lookup(name) {
  const q = async (type) => {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
      return (await r.json()).Answer || [];
    } catch { return []; }
  };
  const ans = await q('A');
  return { cname: ans.filter((a) => a.type === 5).map((a) => a.data.replace(/\.$/, '')), ips: ans.filter((a) => a.type === 1).map((a) => a.data) };
}

// 입력 → 소문자 · 퓨니코드(한글 도메인) 호스트 이름
function normHost(v) {
  let s = String(v || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[\/?#]/)[0].replace(/\.$/, '');
  if (!s) throw new HttpError(400, '도메인을 넣어 주세요.');
  try { s = new URL(`http://${s}`).hostname; } catch { throw new HttpError(400, '도메인 모양이 아닙니다.'); }
  if (!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(s)) throw new HttpError(400, '도메인 모양이 아닙니다.');
  if (s === SAAS_ZONE || s.endsWith(`.${SAAS_ZONE}`)) throw new HttpError(400, `${SAAS_ZONE} 하위 주소는 이 도구가 필요 없습니다 — ${SAAS_ZONE} 존이 유료면 그대로 빠른 IP 로 나갑니다.`);
  return s;
}
// Cloudflare 는 한글 존 이름을 한글(나사렛장학회.kr)로 준다 → 퓨니코드로 바꿔 비교
const ascii = (name) => { try { return new URL(`http://${name}`).hostname; } catch { return name; } };
const zoneOf = (zones, host) => zones.map((z) => ({ ...z, name: ascii(z.name) })).filter((z) => host === z.name || host.endsWith(`.${z.name}`)).sort((a, b) => b.name.length - a.name.length)[0] || null;

async function findHostname(cf, zid, host) {
  return (await cf.call('GET', `/zones/${zid}/custom_hostnames?hostname=${encodeURIComponent(host)}`)).result?.find((h) => h.hostname === host) || null;
}
const routeFor = (routes, host) => routes.find((r) => r.pattern === `${host}/*`) || null;

async function setRoute(cf, zid, routes, host, worker) {
  const cur = routeFor(routes, host);
  if (cur && cur.script === worker) return;
  if (cur) await cf.call('PUT', `/zones/${zid}/workers/routes/${cur.id}`, { pattern: `${host}/*`, script: worker });
  else await cf.call('POST', `/zones/${zid}/workers/routes`, { pattern: `${host}/*`, script: worker });
}

// 화면에 보여 줄 한 도메인의 상태
function stageOf(ch, dns, entryIps) {
  const sslOk = ch?.ssl?.status === 'active';
  const hostOk = ch?.status === 'active';
  const pointed = dns.cname.includes(ENTRY) || (dns.ips.length > 0 && dns.ips.every((ip) => entryIps.includes(ip)));
  // Cloudflare 에 있는 도메인은 호스트 확인이 회색 CNAME 을 건 뒤에야 된다 → 인증서만 준비되면 주소 바꾸기 단계
  let stage = 'cert';
  if (sslOk) stage = hostOk ? 'done' : 'switch'; // 호스트 Active = 실제로 이 존을 가리킨다는 Cloudflare 확인
  return { stage, sslOk, hostOk, pointed };
}
function viewOf(host, ch, route, zone, dns, entryIps, txtSaved) {
  const st = stageOf(ch, dns, entryIps);
  const records = [];
  if (ch) {
    for (const v of ch.ssl?.validation_records || []) if (v.txt_name && v.txt_value) records.push({ type: 'TXT', name: v.txt_name, value: v.txt_value, why: '인증서 확인' });
    const ov = ch.ownership_verification;
    if (ov?.name && ov?.value && ch.status !== 'active') records.push({ type: 'TXT', name: ov.name, value: ov.value, why: '소유 확인' });
  }
  records.push({ type: 'CNAME', name: host, value: ENTRY, why: '주소 바꾸기 (DNS only · 회색 구름)', later: !st.sslOk });
  return {
    host, worker: route?.script || null, mode: zone ? 'auto' : 'manual', zone: zone?.name || null,
    ssl: ch?.ssl?.status || 'none', status: ch?.status || 'none', errors: [...(ch?.verification_errors || []), ...(ch?.ssl?.validation_errors || []).map((e) => e.message)].filter(Boolean),
    expires: ch?.ssl?.expires_on || null, created: ch?.created_at || null,
    dns, ...st, records: zone ? [] : records, txtLeft: txtSaved?.length || 0,
  };
}

// 자동 모드: 다음 단계를 한다(인증서 TXT 넣기 → Active 면 CNAME 으로 바꾸기 → TXT 지우기)
async function advance(env, cf, saas, zones, host, entryIps) {
  const ch = await findHostname(cf, saas.id, host);
  if (!ch) throw new HttpError(404, `${host} 는 아직 등록되지 않았습니다.`);
  const zone = zoneOf(zones, host);
  const log = [];
  if (!zone) return { ch, log };
  const kvKey = `txt:${host}`;
  const saved = JSON.parse((await env.KV.get(kvKey)) || '[]');
  const zid = zone.id;
  const sslOk = ch.ssl?.status === 'active', hostOk = ch.status === 'active';

  if (!sslOk) {
    const want = [];
    for (const v of ch.ssl?.validation_records || []) if (v.txt_name && v.txt_value) want.push({ name: v.txt_name, content: v.txt_value });
    if (!hostOk && ch.ownership_verification?.name) want.push({ name: ch.ownership_verification.name, content: ch.ownership_verification.value });
    let added = 0;
    for (const w of want) {
      const have = (await cf.call('GET', `/zones/${zid}/dns_records?type=TXT&name=${encodeURIComponent(w.name)}`)).result || [];
      const hit = have.find((r) => r.content.replace(/^"|"$/g, '') === w.content);
      if (hit) { if (!saved.includes(hit.id)) saved.push(hit.id); continue; }
      const rec = (await cf.call('POST', `/zones/${zid}/dns_records`, { type: 'TXT', name: w.name, content: `"${w.content}"`, ttl: 60, comment: 'domains 도구: 인증되면 자동으로 지움' })).result;
      saved.push(rec.id); added++;
    }
    await env.KV.put(kvKey, JSON.stringify(saved));
    if (added) log.push(`확인용 TXT ${added}개를 넣었습니다.`);
    if (want.length) { // 대시보드의 Refresh 와 같은 다시 확인
      await cf.call('PATCH', `/zones/${saas.id}/custom_hostnames/${ch.id}`, { ssl: { method: ch.ssl?.method || 'txt', type: ch.ssl?.type || 'dv', settings: ch.ssl?.settings || { min_tls_version: '1.0' } } }).catch(() => {});
    }
    if (!want.length && ch.ssl?.status) log.push(`인증서 준비 중(${ch.ssl.status}) — 잠시 뒤 확인값이 나옵니다.`);
    return { ch: (await findHostname(cf, saas.id, host)) || ch, log };
  }

  // 인증서 Active → 주소 바꾸기 (예전 Workers Custom Domain 떼고 회색 CNAME)
  const cur = (await cf.call('GET', `/zones/${zid}/dns_records?name=${encodeURIComponent(host)}`)).result || [];
  if (!cur.some((r) => r.type === 'CNAME' && r.content === ENTRY && !r.proxied)) {
    const wd = (await cf.call('GET', `/accounts/${ACCOUNT_ID}/workers/domains?hostname=${encodeURIComponent(host)}`)).result || [];
    for (const d of wd.filter((d) => d.hostname === host)) {
      await cf.call('DELETE', `/accounts/${ACCOUNT_ID}/workers/domains/${d.id}`);
      log.push(`예전 연결(Workers Custom Domain → ${d.service})을 뗐습니다.`);
    }
    const recs = (await cf.call('GET', `/zones/${zid}/dns_records?name=${encodeURIComponent(host)}`)).result || [];
    let ok = false;
    for (const r of recs.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type))) {
      if (r.type === 'CNAME' && r.content === ENTRY && !r.proxied) { ok = true; continue; }
      await cf.call('DELETE', `/zones/${zid}/dns_records/${r.id}`);
      log.push(`예전 레코드 ${r.type} ${r.content} 를 지웠습니다.`);
    }
    if (!ok) {
      await cf.call('POST', `/zones/${zid}/dns_records`, { type: 'CNAME', name: host, content: ENTRY, proxied: false, ttl: 60, comment: 'domains 도구: plators.com(유료) IP 로' });
      log.push(`회색 CNAME → ${ENTRY} 를 넣었습니다.`);
    }
  }
  // TXT 찌꺼기 지우기 (호스트까지 Active 된 뒤)
  const now = (await findHostname(cf, saas.id, host)) || ch;
  if (now.status !== 'active') { log.push('주소를 바꿨습니다 — 호스트 확인 기다리는 중(보통 1~2분).'); return { ch: now, log }; }
  if (saved.length) {
    for (const id of saved) await cf.call('DELETE', `/zones/${zid}/dns_records/${id}`).catch(() => {});
    await env.KV.delete(kvKey);
    log.push(`확인용 TXT ${saved.length}개를 지웠습니다.`);
  }
  return { ch: now, log };
}

async function entryIpsOf() { // 새로 만든 입구는 DNS 캐시에 늦게 잡힘 → plators.com 존 IP 도 함께
  const [a, b] = await Promise.all([lookup(ENTRY), lookup(SAAS_ZONE)]);
  return [...new Set([...a.ips, ...b.ips])];
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

  if (path === '/api/login' && method === 'POST') {
    if (!env.DOMAINS_PASS) throw new HttpError(503, '비밀번호(DOMAINS_PASS)가 아직 설정되지 않았습니다.');
    const { pass } = await body(request);
    const ok = sameText(await hmac('domains-login', String(pass ?? '').slice(0, 200)), await hmac('domains-login', env.DOMAINS_PASS));
    if (!ok) { await new Promise((r) => setTimeout(r, 800)); throw new HttpError(401, '비밀번호가 맞지 않습니다.'); }
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${await sessionToken(env)}; Path=/; Max-Age=${180 * 86400}; HttpOnly; Secure; SameSite=Lax` });
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  if (path === '/api/me' && method === 'GET') {
    try { await requireUser(request, env); } catch (e) { if (e.status === 401) return json({ ok: false }); throw e; }
    return json({ ok: true, token: !!(await env.KV.get('token')), entry: ENTRY, zone: SAAS_ZONE });
  }
  await requireUser(request, env);

  // 토큰 넣기 — 필요한 권한을 하나씩 실제로 불러 확인
  if (path === '/api/token' && method === 'POST') {
    const token = String((await body(request)).token || '').trim();
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw new HttpError(400, '토큰 모양이 아닙니다. Cloudflare 에서 만든 토큰 값을 그대로 붙여 넣어 주세요.');
    const cf = client(token);
    const checks = [];
    const tryIt = async (name, fn) => { try { await fn(); checks.push({ name, ok: true }); } catch (e) { checks.push({ name, ok: false, error: e.message }); } };
    let zone = null;
    await tryIt('Zone · Read (존 목록)', async () => { zone = await saasZone(cf); });
    if (zone) {
      await tryIt('DNS · Edit', () => cf.call('GET', `/zones/${zone.id}/dns_records?per_page=1`));
      // 권한이 없으면 10000(Authentication error). 그 밖의 오류(아직 SaaS 를 안 켠 존 등)는 권한 문제가 아니다
      await tryIt('SSL and Certificates · Edit (사용자 지정 호스트)', () => cf.call('GET', `/zones/${zone.id}/custom_hostnames?per_page=1`).catch((e) => { if ((e.cf || []).some((c) => c.code === 10000 || c.code === 9109)) throw e; }));
      await tryIt('Workers Routes · Edit', () => cf.call('GET', `/zones/${zone.id}/workers/routes`));
    }
    // 권한이 없어도 scripts 목록은 빈 목록으로 성공한다 → 권한이 없으면 오류가 나는 workers/domains 로 확인
    await tryIt('Workers Scripts · Edit (계정)', async () => {
      await cf.call('GET', `/accounts/${ACCOUNT_ID}/workers/domains`);
      const n = ((await cf.call('GET', `/accounts/${ACCOUNT_ID}/workers/scripts`)).result || []).length;
      if (!n) throw new HttpError(400, 'Worker 목록이 비어 있습니다 — 계정 정책이 xiangdolee 계정에 걸려 있는지 확인');
    });
    if (checks.some((c) => !c.ok)) return json({ ok: false, checks, error: '빠진 권한: ' + checks.filter((c) => !c.ok).map((c) => c.name).join(', ') }, 400);
    await env.KV.put('token', token);
    return json({ ok: true, checks });
  }

  const cf = await cfFor(env);

  if (path === '/api/status' && method === 'GET') {
    const zone = await saasZone(cf);
    const [entryRecs, fallback, count, entry] = await Promise.all([
      cf.call('GET', `/zones/${zone.id}/dns_records?name=${ENTRY}`).then((o) => o.result || []),
      cf.call('GET', `/zones/${zone.id}/custom_hostnames/fallback_origin`).then((o) => o.result).catch((e) => ({ error: e.message })),
      cf.call('GET', `/zones/${zone.id}/custom_hostnames?per_page=1`).then((o) => o.result_info?.total_count ?? 0).catch(() => null),
      lookup(ENTRY),
    ]);
    return json({
      zone: SAAS_ZONE, plan: zone.plan?.name || '', paid: (zone.plan?.legacy_id || 'free') !== 'free',
      entry: ENTRY, entryRecord: entryRecs.find((r) => ['A', 'AAAA', 'CNAME'].includes(r.type)) || null, entryIps: entry.ips,
      fallback, count,
    });
  }
  if (path === '/api/setup' && method === 'POST') { // 입구 레코드 + Fallback Origin
    const zone = await saasZone(cf);
    const recs = (await cf.call('GET', `/zones/${zone.id}/dns_records?name=${ENTRY}`)).result || [];
    const log = [];
    if (!recs.some((r) => ['A', 'AAAA', 'CNAME'].includes(r.type))) {
      await cf.call('POST', `/zones/${zone.id}/dns_records`, { type: 'AAAA', name: ENTRY, content: ENTRY_IP, proxied: true, ttl: 1, comment: 'domains 도구: 다른 도메인의 입구(실제 원본은 Worker 경로)' });
      log.push(`입구 ${ENTRY} 를 만들었습니다.`);
    } else if (!recs.some((r) => r.proxied)) throw new HttpError(409, `${ENTRY} 레코드가 회색(DNS only)입니다. 주황(Proxied)이어야 합니다.`);
    await cf.call('PUT', `/zones/${zone.id}/custom_hostnames/fallback_origin`, { origin: ENTRY });
    log.push(`Fallback Origin 을 ${ENTRY} 로 정했습니다.`);
    return json({ ok: true, log });
  }
  // 속도 설정 (2026-11-14 "0.1초라도"): 계정의 모든 영역에 HTTP/3 · 0-RTT · Early Hints 를 한 번에.
  //   부스터로 plators.com 을 타는 도메인은 plators.com 설정을 따르고, 따로 있는 영역은 그 영역 설정을 바꾼다
  if (path === '/api/speed' && (method === 'GET' || method === 'POST')) {
    const KEYS = ['http3', '0rtt', 'early_hints'];
    const zones = await cf.all(`/zones?account.id=${ACCOUNT_ID}`);
    const out = [];
    for (const z of zones) {
      const row = { zone: z.name, plan: z.plan?.name || '' };
      for (const k of KEYS) {
        try {
          let v = (await cf.call('GET', `/zones/${z.id}/settings/${k}`)).result?.value;
          if (method === 'POST' && v !== 'on') v = (await cf.call('PATCH', `/zones/${z.id}/settings/${k}`, { value: 'on' })).result?.value;
          row[k] = v;
        } catch (e) { row[k] = 'error'; row.error = e.message; }
      }
      out.push(row);
    }
    return json({ zones: out });
  }
  if (path === '/api/workers' && method === 'GET') {
    const list = (await cf.call('GET', `/accounts/${ACCOUNT_ID}/workers/scripts`)).result || [];
    return json({ workers: list.map((s) => s.id).filter((n) => n !== 'domains' && !n.endsWith('-core')).sort() });
  }

  if (path === '/api/domains' && method === 'GET') {
    const zone = await saasZone(cf);
    let saasError = null;
    const [hosts, routes, zones, entryIps] = await Promise.all([
      cf.all(`/zones/${zone.id}/custom_hostnames`).catch((e) => { saasError = e.message; return []; }),
      cf.call('GET', `/zones/${zone.id}/workers/routes`).then((o) => o.result || []),
      cf.all(`/zones?account.id=${ACCOUNT_ID}`),
      entryIpsOf(),
    ]);
    const items = await Promise.all(hosts.map(async (ch) => viewOf(ch.hostname, ch, routeFor(routes, ch.hostname), zoneOf(zones, ch.hostname), await lookup(ch.hostname), entryIps, JSON.parse((await env.KV.get(`txt:${ch.hostname}`)) || '[]'))));
    items.sort((a, b) => a.host.replace(/^www\./, '').localeCompare(b.host.replace(/^www\./, '')) || a.host.length - b.host.length);
    return json({ items, entryIps, saasError });
  }
  if (path === '/api/domains' && method === 'POST') {
    const b = await body(request);
    const host = normHost(b.host);
    const worker = String(b.worker || '').trim();
    if (!/^[a-z0-9-]+$/.test(worker)) throw new HttpError(400, '연결할 Worker 를 골라 주세요.');
    const scripts = ((await cf.call('GET', `/accounts/${ACCOUNT_ID}/workers/scripts`)).result || []).map((s) => s.id);
    if (!scripts.includes(worker)) throw new HttpError(400, `${worker} Worker 가 없습니다.`);
    const zone = await saasZone(cf);
    const fb = await cf.call('GET', `/zones/${zone.id}/custom_hostnames/fallback_origin`).then((o) => o.result).catch(() => null);
    if (!fb || fb.origin !== ENTRY) throw new HttpError(409, '먼저 위의 "준비하기" 를 눌러 입구를 만들어 주세요.');
    const list = [host];
    if (b.www && !host.startsWith('www.')) list.push(`www.${host}`);
    const routes = (await cf.call('GET', `/zones/${zone.id}/workers/routes`)).result || [];
    const log = [];
    for (const h of list) {
      if (!(await findHostname(cf, zone.id, h))) {
        await cf.call('POST', `/zones/${zone.id}/custom_hostnames`, { hostname: h, ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.0' } } });
        log.push(`${h} 를 등록했습니다.`);
      } else log.push(`${h} 는 이미 등록돼 있습니다.`);
      await setRoute(cf, zone.id, routes, h, worker);
    }
    log.push(`Worker 경로 → ${worker}`);
    return json({ ok: true, hosts: list, log });
  }

  const m = path.match(/^\/api\/domains\/([^/]+)(\/check|\/revert)?$/);
  if (m) {
    const host = normHost(decodeURIComponent(m[1]));
    const zone = await saasZone(cf);
    const [zones, routes, entryIps] = await Promise.all([cf.all(`/zones?account.id=${ACCOUNT_ID}`), cf.call('GET', `/zones/${zone.id}/workers/routes`).then((o) => o.result || []), entryIpsOf()]);
    const acctZone = zoneOf(zones, host);

    if (m[2] === '/check' && method === 'POST') {
      const { ch, log } = await advance(env, cf, zone, zones, host, entryIps);
      const view = viewOf(host, ch, routeFor(routes, host), acctZone, await lookup(host), entryIps, JSON.parse((await env.KV.get(`txt:${host}`)) || '[]'));
      return json({ item: view, log });
    }
    if (!m[2] && method === 'PUT') {
      const worker = String((await body(request)).worker || '').trim();
      if (!/^[a-z0-9-]+$/.test(worker)) throw new HttpError(400, 'Worker 이름이 이상합니다.');
      await setRoute(cf, zone.id, routes, host, worker);
      return json({ ok: true });
    }
    // 되돌리기(자동 모드만): 회색 CNAME 을 떼고 예전처럼 Workers Custom Domain 으로 붙인 뒤 등록 삭제
    if (m[2] === '/revert' && method === 'POST') {
      if (!acctZone) throw new HttpError(400, '이 계정에 없는 도메인이라 되돌리기를 할 수 없습니다. 그 도메인 DNS 를 직접 예전 값으로 바꿔 주세요.');
      const route = routeFor(routes, host);
      if (!route?.script) throw new HttpError(400, '연결된 Worker 를 몰라 되돌릴 수 없습니다.');
      const log = [];
      const recs = (await cf.call('GET', `/zones/${acctZone.id}/dns_records?name=${encodeURIComponent(host)}`)).result || [];
      for (const r of recs.filter((r) => r.type === 'CNAME' && r.content === ENTRY)) { await cf.call('DELETE', `/zones/${acctZone.id}/dns_records/${r.id}`); log.push('회색 CNAME 을 지웠습니다.'); }
      await cf.call('PUT', `/accounts/${ACCOUNT_ID}/workers/domains`, { hostname: host, service: route.script, zone_id: acctZone.id, environment: 'production' });
      log.push(`Workers Custom Domain → ${route.script} 로 다시 붙였습니다.`);
      await removeSaas(env, cf, zone.id, routes, host, acctZone.id);
      log.push('등록을 지웠습니다.');
      return json({ ok: true, log });
    }
    if (!m[2] && method === 'DELETE') {
      if (acctZone) { // 이 계정 도메인이면 넣어 둔 회색 CNAME 도 함께 정리(안 그러면 빈 입구를 가리킴)
        const recs = (await cf.call('GET', `/zones/${acctZone.id}/dns_records?name=${encodeURIComponent(host)}`)).result || [];
        if (recs.some((r) => r.type === 'CNAME' && r.content === ENTRY)) throw new HttpError(409, '이 도메인은 아직 이 길을 쓰고 있습니다. 지우면 사이트가 멈추니 "예전 방식으로 되돌리기" 를 쓰세요.');
      }
      await removeSaas(env, cf, zone.id, routes, host, acctZone?.id);
      return json({ ok: true });
    }
  }
  throw new HttpError(404, '없는 주소');
}

async function removeSaas(env, cf, zid, routes, host, acctZid) {
  const ch = await findHostname(cf, zid, host);
  if (ch) await cf.call('DELETE', `/zones/${zid}/custom_hostnames/${ch.id}`);
  const route = routeFor(routes, host);
  if (route) await cf.call('DELETE', `/zones/${zid}/workers/routes/${route.id}`);
  const saved = JSON.parse((await env.KV.get(`txt:${host}`)) || '[]');
  if (acctZid) for (const id of saved) await cf.call('DELETE', `/zones/${acctZid}/dns_records/${id}`).catch(() => {});
  await env.KV.delete(`txt:${host}`);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e); return json({ error: '서버 오류: ' + (e.message || e) }, 500);
    }
  },
};
