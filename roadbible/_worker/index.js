/* 길 성경통독 Worker
   - /qt       : 성서유니온 '오늘의 묵상'(sum.su.or.kr)을 서버에서 받아 파싱 → JSON (같은 출처라 브라우저 CORS 없음)
                 업스트림(:8888)이 느리고 응답시간이 들쭉날쭉(2~30초)이라, 파싱 결과를 worker 메모리 · 엣지 캐시에 담아
                 클라이언트에는 즉시 응답한다(느린 업스트림은 백그라운드에서만 갱신).
   - /api/sync : 회원별 형광펜 · 가름끈 · 읽음 · 별표 · 설정 (xms 로그인 — 같은 xms_sess 쿠키, 2026-11-04 구글 로그인 · Firestore 에서 옮겨 연결 끊음)
                 저장은 Durable Object(Sync, 회원 하나에 하나). 합치기는 화면(mergeCloud)이 하고, 서버는 버전 번호로 앞뒤만 가린다.
   - /         : 소개 페이지(index.html). 로그인한 회원은 /app 으로 · /app = 성경 앱(app.html)
   - 그 밖     : xim 공통 사이트 Worker (회원 로그인 · 가입 · 계정 버튼 · 정적 파일) */
import { DurableObject } from 'cloudflare:workers';
import site from '../../xim/_worker/site-worker.js';
const QT_URL = "https://sum.su.or.kr:8888/bible/today";
const FRESH_MS = 20 * 60 * 1000;    // 이 시간 안이면 캐시를 '신선'으로 보고 즉시 응답
const UPSTREAM_TIMEOUT_MS = 15000;  // 업스트림이 이보다 느리면 포기(무한 대기 방지)

// 모듈 전역 메모리 캐시(같은 isolate 내 요청끼리 공유; Cloudflare가 isolate를 재사용)
let MEM = null;   // { data, at }

function clean(s) {
  return (s || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseQt(html) {
  const pick = (re) => { const m = html.match(re); return m ? clean(m[1]) : ""; };
  const title = pick(/id=["']bible_text["'][^>]*>([\s\S]*?)<\/div>/);
  const info = pick(/id=["']bibleinfo_box["'][^>]*>([\s\S]*?)<\/div>/).replace(/\s*찬송가?\s*\d+장.*$/, "").trim();
  const dm = html.match(/\d{4}\.\d{2}\.\d{2}\s*\([^)]*\)/);
  const date = dm ? clean(dm[0]) : "";
  const verses = [];
  const bl = html.match(/id=["']body_list["'][^>]*>([\s\S]*?)<\/ul>/);
  if (bl) {
    const re = /<div class=["']?num["']?>([\s\S]*?)<\/div>\s*<div class=["']?info["']?>([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(bl[1]))) verses.push({ n: clean(m[1]), t: clean(m[2]) });
  }
  return { date, title, info, verses };
}

// 클라이언트로 보내는 응답(매번 worker가 즉시 답하되, 그 답은 메모리에서 꺼냄 → 브라우저엔 캐시 금지)
function clientJson(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// 업스트림에서 새로 받아 파싱(타임아웃 포함)
async function fetchQt() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(QT_URL, { headers: { "User-Agent": "Mozilla/5.0" }, signal: ac.signal });
    const html = await r.text();
    const data = parseQt(html);
    if (!data.title && !data.verses.length) throw new Error("parse-empty");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// 엣지 캐시(Cache API) — 같은 콜로의 여러 isolate가 공유. workers.dev에서 동작하면 큰 도움.
const EDGE_KEY = "https://qt-cache.internal/today";
async function edgeGet() {
  try {
    const res = await caches.default.match(EDGE_KEY);
    if (!res) return null;
    return { data: await res.json(), at: +(res.headers.get("x-fetched-at") || 0) };
  } catch (e) { return null; }
}
async function edgePut(data, at) {
  try {
    await caches.default.put(EDGE_KEY, new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "max-age=86400", "x-fetched-at": String(at) },
    }));
  } catch (e) { /* 무시 */ }
}

// 같은 isolate 안의 갱신은 하나만(여럿이 동시에 눌러도 업스트림은 한 번)
let REFRESH_P = null;
let LAST_TRY = 0;
function refresh() {
  if (REFRESH_P) return REFRESH_P;
  LAST_TRY = Date.now();
  REFRESH_P = (async () => {
    try {
      const at = Date.now();
      const data = await fetchQt();
      MEM = { data, at };
      await edgePut(data, at);
      return data;
    } catch (e) { return null; /* 갱신 실패 — 기존 캐시 유지 */ }
    finally { REFRESH_P = null; }
  })();
  return REFRESH_P;
}

// 한국 날짜 "YYYY.MM.DD" — 본문 날짜("2026.11.05 (목)")와 맞춰 본다
function todayKst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
const isToday = (data) => !!(data && data.date && data.date.startsWith(todayKst()));

/* 캐시가 오늘 것이면 즉시 답하고(오래됐으면 뒤에서 갱신),
   어제 것이면 새로 받을 때까지 기다린다 — 예전엔 어제 것을 먼저 주고 뒤에서만 갱신해서
   Q 를 처음 누르면 어제 본문이, 한참 뒤 다시 눌러야 오늘 본문이 나왔다(2026-11-05 고침).
   다만 업스트림이 아직 어제 것을 주는 자정 직후엔 1분에 한 번만 다시 받아 본다. */
async function handleQt(ctx) {
  const now = Date.now();
  if (!MEM) {
    const edge = await edgeGet();   // 같은 콜로의 다른 isolate 가 채워 둔 것
    if (edge) MEM = edge;
  }
  if (MEM && isToday(MEM.data)) {
    if (now - MEM.at >= FRESH_MS) ctx.waitUntil(refresh());
    return clientJson(MEM.data);
  }
  if (MEM && now - LAST_TRY < 60000 && !REFRESH_P) return clientJson(MEM.data);
  const data = await refresh();
  if (data) return clientJson(data);
  return clientJson(MEM ? MEM.data : { error: 'upstream' });
}


// ───────── 회원별 동기화 ─────────
export class Sync extends DurableObject {
  async read() { return (await this.ctx.storage.get('s')) || { doc: null, ver: 0, migrated: 0, at: 0 }; }
  // base = 화면이 마지막으로 받은 버전. 그 뒤 다른 기기가 먼저 올렸으면 저장하지 않고 지금 것을 돌려준다(화면이 합쳐 다시 올림)
  async write(doc, base, migrated) {
    const cur = await this.read();
    if (base !== cur.ver) return { conflict: true, ...cur };
    const next = { doc, ver: cur.ver + 1, migrated: migrated ? Date.now() : cur.migrated, at: Date.now() };
    await this.ctx.storage.put('s', next);
    return next;
  }
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
// 지금 로그인한 xms 회원의 아이디(이메일). 손님 · 운영자 모드 · xms 응답 없음 → null
async function memberId(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  if (!env.XMS || !/(?:^|;\s*)xms_sess=/.test(cookie)) return null;
  try {
    const req = new Request(`${new URL(request.url).origin}/xms-api/me`, { headers: { Cookie: cookie, 'X-Xim-Site': env.XIM_SITE } });
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const d = await res.json();
    return d.login_id ? String(d.login_id).toLowerCase() : null;
  } catch { return null; }
}
const MAX_DOC = 1800000; // Durable Object 값 한도(2MB) 안에서
async function syncApi(request, env) {
  const id = await memberId(request, env);
  if (!id) return json({ error: '회원 로그인이 필요합니다.' }, 401);
  const stub = env.SYNC.get(env.SYNC.idFromName(`roadbible:${id}`));
  if (request.method === 'GET') {
    const s = await stub.read();
    return json({ doc: s.doc, ver: s.ver, migrated: !!s.migrated });
  }
  if (request.method === 'PUT') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'bad origin' }, 403);
    const text = await request.text();
    if (text.length > MAX_DOC) return json({ error: '저장할 기록이 너무 큽니다.' }, 413);
    let v;
    try { v = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    if (!v || typeof v.doc !== 'object' || !v.doc || Array.isArray(v.doc)) return json({ error: 'bad doc' }, 400);
    const r = await stub.write(v.doc, Number(v.base) || 0, !!v.migrated);
    if (r.conflict) return json({ doc: r.doc, ver: r.ver, migrated: !!r.migrated }, 409);
    return json({ ok: true, ver: r.ver, migrated: !!r.migrated });
  }
  return json({ error: 'method' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/qt') return handleQt(ctx);
    if (url.pathname === '/api/sync' && env.SYNC) return syncApi(request, env);
    // 첫 화면(/) = 소개 페이지. 로그인한 회원이면 바로 성경 앱(/app)으로 (사용자 지시 2026-11-08 — 올리브바스켓과 같은 흐름)
    if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET' && (await memberId(request, env))) {
      return new Response(null, { status: 302, headers: { Location: '/app', 'Cache-Control': 'no-store' } });
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
