// 팝업 — 홈 화면에 들어온 방문자에게 띄우는 창. 여러 개가 뜨면 창 하나 안에서 좌우로 넘어간다.
//   status: WAITING 대기 | OPEN 노출 | CLOSED 종료
//   close_mode: TODAY 오늘 하루 열지 않음 | FOREVER 다시 열지 않음 | ALWAYS 기간 내 무조건 열림
import { now, bad, notFound, json, str, body, audit } from './lib.js';
import { checkQuota, touchUsage } from './uploads.js';

const STATUS = ['WAITING', 'OPEN', 'CLOSED'];
const MODES = ['TODAY', 'FOREVER', 'ALWAYS'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayKst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export function bucketOf(p, today = todayKst()) {
  if (p.ends_at && p.ends_at < today) return 'expired';
  if (p.status === 'OPEN' && (!p.starts_at || p.starts_at <= today)) return 'live';
  return 'idle';
}
const out = (p, img) => ({
  id: p.id, title: p.title, body: p.body, link_url: p.link_url, starts_at: p.starts_at, ends_at: p.ends_at,
  status: p.status, close_mode: p.close_mode, sort: p.sort, bucket: bucketOf(p),
  image: img ? `/xms/file/popup-${p.id}?v=${img}` : null,
});

async function images(db, site) {
  const { results } = await db.prepare("SELECT kind, updated_at FROM site_files WHERE site = ? AND kind LIKE 'popup-%'").bind(site).all();
  return Object.fromEntries(results.map((r) => [Number(r.kind.slice(6)), r.updated_at]));
}

function fields(raw) {
  const title = str(raw.title, 60);
  if (!title) throw bad('팝업 이름을 넣어 주세요.');
  const starts = str(raw.starts_at, 10);
  const ends = str(raw.ends_at, 10);
  if ((starts && !DATE_RE.test(starts)) || (ends && !DATE_RE.test(ends))) throw bad('노출 기간 날짜를 확인해 주세요.');
  if (starts && ends && ends < starts) throw bad('노출 기간의 끝이 시작보다 앞입니다.');
  const link = str(raw.link_url, 500);
  if (link && !/^(https?:\/\/\S+|\/\S*)$/i.test(link)) throw bad('링크는 / 로 시작하는 사이트 안 주소나 https:// 주소로 넣어 주세요.');
  return {
    title, body: str(raw.body, 2000), link_url: link, starts_at: starts, ends_at: ends,
    status: STATUS.includes(raw.status) ? raw.status : 'OPEN',
    close_mode: MODES.includes(raw.close_mode) ? raw.close_mode : 'TODAY',
  };
}
// 그림: 브라우저가 줄여 보낸 data URL. null = 빼기, undefined = 그대로
function imageField(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const m = String(v).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw bad('그림 파일 형식이 잘못됐습니다.');
  if (m[2].length * 0.75 > 1500000) throw bad('그림이 너무 큽니다.');
  return { mime: m[1], b64: m[2] };
}

export async function popupsApi(ctx, path, method) {
  const { request, env, site, me } = ctx;
  const db = env.DB;
  let m;
  if (path === '/popups' && method === 'GET') {
    const [{ results }, img] = await Promise.all([db.prepare('SELECT * FROM popups WHERE site = ? ORDER BY sort, id').bind(site).all(), images(db, site)]);
    return json(results.map((p) => out(p, img[p.id])));
  }
  if (path === '/popups' && method === 'POST') {
    const raw = await body(request);
    const f = fields(raw);
    const img = imageField(raw.image);
    if (!img && !f.body) throw bad('그림도 본문도 없습니다. 둘 중 하나는 있어야 저장됩니다.');
    if (img) await checkQuota(env, site, me, img.b64.length * 0.75);   // 팝업 그림도 저장 용량에 든다
    const max = await db.prepare('SELECT MAX(sort) AS s FROM popups WHERE site = ?').bind(site).first();
    const t = now();
    const r = await db.prepare(`INSERT INTO popups (site, title, body, link_url, starts_at, ends_at, status, close_mode, sort, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(site, f.title, f.body, f.link_url, f.starts_at, f.ends_at, f.status, f.close_mode, (max?.s || 0) + 1, t, t).run();
    const id = r.meta.last_row_id;
    if (img) { await db.prepare('INSERT OR REPLACE INTO site_files (site, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)').bind(site, `popup-${id}`, img.mime, img.b64, t).run(); await touchUsage(env, site); }
    await audit(db, site, me, request, 'POPUP_CREATE', f.title);
    return json({ id });
  }
  if (path === '/popups/order' && method === 'PUT') {
    const { ids } = await body(request);
    if (!Array.isArray(ids)) throw bad('차례가 없습니다.');
    await db.batch(ids.map((id, i) => db.prepare('UPDATE popups SET sort = ? WHERE id = ? AND site = ?').bind(i + 1, Number(id), site)));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/popups\/(\d+)$/))) {
    const p = await db.prepare('SELECT * FROM popups WHERE id = ? AND site = ?').bind(+m[1], site).first();
    if (!p) throw notFound('없는 팝업입니다.');
    if (method === 'GET') return json(out(p, (await images(db, site))[p.id]));
    if (method === 'PUT') {
      const raw = await body(request);
      const f = fields(raw);
      const img = imageField(raw.image);
      const hasImg = img === undefined ? !!(await images(db, site))[p.id] : !!img;
      if (!hasImg && !f.body) throw bad('그림도 본문도 없습니다. 둘 중 하나는 있어야 저장됩니다.');
      if (img) await checkQuota(env, site, me, img.b64.length * 0.75);
      const t = now();
      await db.prepare('UPDATE popups SET title = ?, body = ?, link_url = ?, starts_at = ?, ends_at = ?, status = ?, close_mode = ?, updated_at = ? WHERE id = ?')
        .bind(f.title, f.body, f.link_url, f.starts_at, f.ends_at, f.status, f.close_mode, t, p.id).run();
      if (img) await db.prepare('INSERT OR REPLACE INTO site_files (site, kind, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)').bind(site, `popup-${p.id}`, img.mime, img.b64, t).run();
      if (img === null) await db.prepare('DELETE FROM site_files WHERE site = ? AND kind = ?').bind(site, `popup-${p.id}`).run();
      if (img !== undefined) await touchUsage(env, site);
      await audit(db, site, me, request, 'POPUP_UPDATE', f.title);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await db.batch([
        db.prepare('DELETE FROM popups WHERE id = ?').bind(p.id),
        db.prepare('DELETE FROM site_files WHERE site = ? AND kind = ?').bind(site, `popup-${p.id}`),
      ]);
      await audit(db, site, me, request, 'POPUP_DELETE', p.title);
      return json({ ok: true });
    }
  }
  return null;
}

// 홈 화면에 띄울 팝업 (지금 노출 중인 것, 차례대로)
export async function livePopups(db, site) {
  const [{ results }, img] = await Promise.all([db.prepare("SELECT * FROM popups WHERE site = ? AND status = 'OPEN' ORDER BY sort, id").bind(site).all(), images(db, site)]);
  return results.filter((p) => bucketOf(p) === 'live').map((p) => ({
    id: p.id, v: p.updated_at, body: p.body, link: p.link_url, mode: p.close_mode, ends: p.ends_at,
    image: img[p.id] ? `/xms/file/popup-${p.id}?v=${img[p.id]}` : null,
  }));
}
