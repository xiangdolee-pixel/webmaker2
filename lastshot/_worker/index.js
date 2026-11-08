// lastshot — 게임 화면은 정적 파일, 랭킹(1~10등)만 여기서
//   GET  /api/rank                        → { top: [{ id, name, score, level }] }  (점수 높은 차례, 같으면 먼저 넣은 사람)
//   POST /api/rank { name, score, level } → { id, rank, top }
//   그 밖(페이지 · /xms 관리 · /member)은 xim 공통 사이트 Worker 가 맡는다.
//   바인딩: DB(D1 lastshot, 표는 schema.sql)
import site from '../../xim/_worker/site-worker.js';

const TOP = 10;
const MAX_SCORE = 50000000;   // 말이 안 되는 점수는 받지 않는다
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const top = async (db) => (await db.prepare('SELECT id, name, score, level FROM scores ORDER BY score DESC, id LIMIT ?').bind(TOP).all()).results;

async function rank(request, env) {
  const db = env.DB;
  if (request.method === 'GET') return json({ top: await top(db) });
  if (request.method !== 'POST') return json({ error: '지원하지 않는 요청입니다.' }, 405);
  // 다른 사이트 폼으로 몰래 보내지 못하게 JSON 만
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json({ error: 'JSON 으로 보내 주세요.' }, 400);
  let v;
  try { v = await request.json(); } catch { return json({ error: '내용을 읽을 수 없습니다.' }, 400); }
  const name = String(v.name ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
  const score = Math.floor(Number(v.score));
  const level = Math.max(1, Math.min(9999, Math.floor(Number(v.level)) || 1));
  if (!name) return json({ error: '이름을 넣어 주세요.' }, 400);
  if (!(score > 0 && score <= MAX_SCORE)) return json({ error: '점수가 올바르지 않습니다.' }, 400);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  // 같은 곳에서 너무 자주 넣지 못하게 (1분에 5번)
  const recent = await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip = ? AND created_at > ?').bind(ip, Date.now() - 60000).first();
  if (recent.n >= 5) return json({ error: '잠시 뒤에 다시 넣어 주세요.' }, 429);
  // 10등 안에 드는 점수만 남긴다
  const list = await top(db);
  if (list.length >= TOP && score <= list[list.length - 1].score) return json({ error: '아쉽게도 10등 안에 들지 못했어요.', top: list }, 409);
  const r = await db.prepare('INSERT INTO scores (name, score, level, ip, created_at) VALUES (?, ?, ?, ?, ?)').bind(name, score, level, ip, Date.now()).run();
  const id = r.meta.last_row_id;
  // 10등 밖으로 밀린 기록 정리
  await db.prepare('DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC, id LIMIT ?)').bind(TOP).run();
  const now = await top(db);
  return json({ id, rank: now.findIndex((x) => x.id === id) + 1, top: now });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/rank') {
      try { return await rank(request, env); } catch (e) { console.error(e); return json({ error: '서버 오류가 났습니다.' }, 500); }
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
