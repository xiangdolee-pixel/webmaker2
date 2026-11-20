// J-Docs — 견적서 · 거래명세서 · 청구서 · 공문 만들기 · 보관 (사용자 지시 2026-11-20, xim '계약서' 아래 메뉴)
//
//   운영자(xim 'J-Docs' 메뉴, 로그인 뒤)  /api/jdocs/*
//     GET  docs?q=&type=&cat=&year=&trash=&per=&page=   목록 · 검색
//     GET  docs/:id · POST docs · PUT docs/:id          문서 하나 · 새 문서(번호 자동 YYYY-MMDD-NNN, 날짜별 순번) · 저장(version 이 다르면 409)
//     POST docs/:id/renumber · restore, DELETE docs/:id(휴지통) · ?hard=1(완전 삭제), POST trash/empty
//     GET/PUT settings                                   회사 정보 · 기본값 · 항목 창고
//     GET/POST templates · PUT/DELETE templates/:id      템플릿(불러와서 새 문서로)
//     GET/POST clients · PUT/DELETE clients/:name        클라이언트 카테고리
//     GET  stamp · seal                                  도장 그림 — 계약서 '을 정보 · 도장'(settings.contract_eul)의 그림을 같이 쓴다
//   고객(로그인 없음, 주소 6자를 아는 사람만)  /d/<6자> (화면) · /api/jdp/<6자> (내용) · /api/jdp/<6자>/stamp|seal
//
//   회사 정보는 jd_settings 에만 있다(코드 · 리포에 두지 않는다). 사업장 주소는 받지도 내보내지도 않는다(사용자 지시: 공개하지 않음).

const TYPE_NAME = { quote: '견적서', statement: '거래명세서', invoice: '청구서', letter: '공문' };
const SLUG_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';   // 헷갈리는 0 O 1 l I 는 뺀다
const SLUG_RE = /^[A-Za-z0-9]{6}$/;
const FAIL_WINDOW = 10 * 60000;   // 없는 문서 주소를 10분에
const FAIL_MAX = 20;              //   20번 넘게 두드리면 잠깐 막는다(주소 찍어 보기 방지)
const ROW = "id, no, type, title, client, doc_date, amount, vat, parent_id, deleted, version, created_at, updated_at, slug, json_extract(data, '$.category') AS category";

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m, status = 400) => new HttpError(status, m);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
const escH = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numOf = (v) => { const n = Number(String(v ?? '').replace(/[,\s원]/g, '')); return Number.isFinite(n) ? n : 0; };
const changes = (r) => (r.meta && r.meta.changes) || 0;
async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw bad('JSON 으로 보내 주세요.');
  try { return (await request.json()) || {}; } catch { throw bad('요청 내용을 읽을 수 없습니다.'); }
}

// 검색용 글자 모음
function searchText(d) {
  const parts = [d.no, d.title, d.category, d.client?.name, d.client?.ref, d.memo, d.notes,
    ...(d.extra || []).map((e) => e.value),
    ...(d.groups || []).flatMap((g) => [g.name, ...(g.lines || []).map((l) => `${l.text || ''} ${l.note || ''}`)])];
  return parts.filter(Boolean).join(' ').replace(/\*\*/g, '').toLowerCase();
}

async function nextNo(db, date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) throw bad('날짜가 올바르지 않습니다.');
  const k = `${m[1]}-${m[2]}${m[3]}`;
  for (let i = 0; i < 20; i++) {
    const r = await db.prepare('INSERT INTO jd_counters(k, n) VALUES(?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n').bind(k).first();
    const no = `${k}-${String(r.n).padStart(3, '0')}`;
    if (!(await db.prepare('SELECT 1 FROM jd_docs WHERE no = ?').bind(no).first())) return no;
  }
  throw bad('문서번호를 만들지 못했습니다.', 500);
}

// 문서 모양 확인 — 화면이 만든 것만 받는다(글자 칸은 글자, 목록은 목록). 어긋나면 저장하지 않는다
const isText = (v) => v === undefined || v === null || typeof v === 'string';
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function clean(d, { needDate = true } = {}) {
  if (!isObj(d)) throw bad('문서 내용이 없습니다.');
  if (typeof d.type !== 'string' || !Object.hasOwn(TYPE_NAME, d.type)) throw bad('문서 종류가 올바르지 않습니다.');
  const okDate = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date);
  if (needDate ? !okDate : !(okDate || !d.date)) throw bad('날짜가 올바르지 않습니다.');
  const ok = ['title', 'no', 'vat', 'category', 'memo', 'notes', 'account'].every((k) => isText(d[k]))
    && (d.client === undefined || (isObj(d.client) && isText(d.client.name) && isText(d.client.ref)))
    && (d.extra === undefined || (Array.isArray(d.extra) && d.extra.every((e) => isObj(e) && isText(e.label) && isText(e.value))))
    && (d.groups === undefined || (Array.isArray(d.groups) && d.groups.every((g) => isObj(g) && isText(g.name) && (g.lines === undefined || (Array.isArray(g.lines) && g.lines.every((l) => isObj(l) && isText(l.text) && isText(l.note)))))))
    && (d.rate === undefined || d.rate === null || isObj(d.rate));
  if (!ok) throw bad('문서 내용을 읽을 수 없습니다.');
  if (JSON.stringify(d).length > 400000) throw bad('문서가 너무 큽니다.');
  return d;
}
function needCategory(d) {
  if (!String(d.category || '').trim()) throw bad('클라이언트 카테고리를 넣어 주세요(필수).');
}

// 클라이언트: name = 카테고리 이름(문서를 모으는 이름), recipient = 서식에 찍힐 수신, aliases = 검색어(쉼표로)
const cleanClient = (b) => ({
  name: String(b.name || '').trim().slice(0, 80),
  recipient: String(b.recipient || '').trim().slice(0, 120),
  aliases: String(b.aliases || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30).join(', '),
  ref: String(b.ref || '').trim().slice(0, 80),
  tel: String(b.tel || '').trim().slice(0, 40),
  memo: String(b.memo || '').trim().slice(0, 1000),
});
async function addClient(db, name, now) {
  name = String(name || '').trim().slice(0, 80);
  if (name) await db.prepare('INSERT OR IGNORE INTO jd_clients(name, created_at, updated_at) VALUES(?, ?, ?)').bind(name, now, now).run();
}

function newSlug() {
  let s = '';
  while (s.length < 6) {
    for (const v of crypto.getRandomValues(new Uint8Array(12))) if (v < 228 && s.length < 6) s += SLUG_CH[v % 57];   // 228 = 57 × 4: 글자마다 고르게
  }
  return s;
}
async function setSlug(db, id) {
  for (let i = 0; i < 8; i++) {
    const s = newSlug();
    try {
      if (changes(await db.prepare('UPDATE jd_docs SET slug = ? WHERE id = ? AND slug IS NULL').bind(s, id).run())) return s;
      const row = await db.prepare('SELECT slug FROM jd_docs WHERE id = ?').bind(id).first();   // 다른 요청이 먼저 붙였다
      if (row?.slug) return row.slug;
    } catch { /* 겹침 → 다시 */ }
  }
  throw bad('문서 주소를 만들지 못했습니다.', 500);
}

// 회사 정보에서 주소는 언제나 뺀다 — 저장할 때도, 내보낼 때도
function noAddr(company) {
  if (!company || typeof company !== 'object') return company;
  const c = { ...company };
  delete c.addr; delete c.address;
  return c;
}
async function getSettings(db) {
  const r = await db.prepare('SELECT v, updated_at FROM jd_settings WHERE k = ?').bind('main').first();
  if (!r) return { settings: null, updated_at: 0 };
  let s = null; try { s = JSON.parse(r.v); } catch { s = null; }
  if (s && s.company) s.company = noAddr(s.company);
  return { settings: s, updated_at: r.updated_at };
}

// 도장 그림: 계약서 '을 정보 · 도장'에 올린 그림(data URL)을 그대로 쓴다. 없으면 404(문서는 도장 없이 그려진다)
async function stampImage(db) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('contract_eul').first();
  let sign = ''; try { sign = String(JSON.parse(row?.value || '{}').sign || ''); } catch { sign = ''; }
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(sign);
  if (!m) return new Response('도장 그림이 없습니다.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' } });
}

// ───────── 운영자 API — 로그인은 부르는 쪽(ximApi)에서 이미 확인했다 ─────────
// 반환: Response, 또는 null(이 길이 아님)
export async function jdocsApi(request, env, url, path, audit) {
  const db = env.DB;
  const M = request.method;
  const now = Date.now();
  const p = path.slice('/api/jdocs'.length);
  // 쓰기 요청은 이 화면(같은 출처)에서 온 것만 — 내용 없이 보내는 요청(되살리기 · 번호 다시 받기 · 휴지통 비우기)을 다른 사이트의 폼이 대신 누르지 못하게
  if (M !== 'GET' && M !== 'HEAD') {
    const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
    if ((origin && origin !== url.origin) || (site && site !== 'same-origin') || (!origin && !site)) throw bad('이 화면에서 보낸 요청이 아닙니다.', 403);
  }

  if (p === '/stamp' || p === '/seal') return stampImage(db);

  if (p === '/settings') {
    if (M === 'GET') return json({ ok: true, ...(await getSettings(db)) });
    if (M === 'PUT') {
      const b = await readBody(request);
      if (!b.settings || typeof b.settings !== 'object') throw bad('설정 내용이 없습니다.');
      const s = { ...b.settings, company: noAddr(b.settings.company) };
      const v = JSON.stringify(s);
      if (v.length > 600000) throw bad('설정이 너무 큽니다.');
      await db.prepare('INSERT INTO jd_settings(k, v, updated_at) VALUES(?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at').bind('main', v, now).run();
      await audit('JDOCS_SET', '설정', '');
      return json({ ok: true, updated_at: now });
    }
  }

  // 휴지통 비우기: 휴지통에 있는 문서를 완전히 지운다(되돌릴 수 없음)
  if (p === '/trash/empty' && M === 'POST') {
    await db.prepare('UPDATE jd_docs SET parent_id = NULL WHERE parent_id IN (SELECT id FROM jd_docs WHERE deleted = 1)').run();
    const d = await db.prepare('DELETE FROM jd_docs WHERE deleted = 1').run();
    await audit('JDOCS_DEL', '휴지통 비우기', `${changes(d)}건`);
    return json({ ok: true, docs: changes(d) });
  }

  if (p === '/clients' || p.startsWith('/clients/')) {
    if (p === '/clients' && M === 'GET') {
      const [reg, used] = await db.batch([
        db.prepare('SELECT name, recipient, aliases, ref, tel, memo FROM jd_clients'),
        db.prepare("SELECT json_extract(data, '$.category') AS name, COUNT(*) AS n FROM jd_docs WHERE deleted = 0 AND COALESCE(json_extract(data, '$.category'), '') != '' GROUP BY 1"),
      ]);
      const map = new Map(reg.results.map((r) => [r.name, { ...r, n: 0 }]));
      used.results.forEach((r) => map.set(r.name, { ...(map.get(r.name) || { name: r.name }), n: r.n }));
      return json({ ok: true, clients: [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko')) });
    }
    if (p === '/clients' && M === 'POST') {
      const c = cleanClient(await readBody(request));
      if (!c.name) throw bad('카테고리 이름을 넣어 주세요.');
      if (await db.prepare('SELECT 1 FROM jd_clients WHERE name = ?').bind(c.name).first()) throw bad('이미 있는 카테고리 이름입니다.');
      await db.prepare('INSERT INTO jd_clients(name, recipient, aliases, ref, tel, memo, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').bind(c.name, c.recipient, c.aliases, c.ref, c.tel, c.memo, now, now).run();
      return json({ ok: true });
    }
    let old = '';
    try { old = decodeURIComponent(p.slice('/clients/'.length)); } catch { throw bad('이름을 읽을 수 없습니다.'); }
    if (old && M === 'PUT') {
      const c = cleanClient(await readBody(request));
      if (!c.name) throw bad('카테고리 이름을 넣어 주세요.');
      if (c.name !== old && await db.prepare('SELECT 1 FROM jd_clients WHERE name = ?').bind(c.name).first()) throw bad('이미 있는 카테고리 이름입니다.');
      if (await db.prepare('SELECT 1 FROM jd_clients WHERE name = ?').bind(old).first()) await db.prepare('UPDATE jd_clients SET name = ?, recipient = ?, aliases = ?, ref = ?, tel = ?, memo = ?, updated_at = ? WHERE name = ?').bind(c.name, c.recipient, c.aliases, c.ref, c.tel, c.memo, now, old).run();
      else await db.prepare('INSERT INTO jd_clients(name, recipient, aliases, ref, tel, memo, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').bind(c.name, c.recipient, c.aliases, c.ref, c.tel, c.memo, now, now).run();
      // 이름을 바꾸면 그 카테고리로 묶인 문서 · 템플릿도 함께 바꾼다
      let moved = 0;
      if (c.name !== old) {
        moved = changes(await db.prepare("UPDATE jd_docs SET data = json_set(data, '$.category', ?) WHERE json_extract(data, '$.category') = ?").bind(c.name, old).run());
        await db.prepare("UPDATE jd_templates SET data = json_set(data, '$.category', ?) WHERE json_extract(data, '$.category') = ?").bind(c.name, old).run();
      }
      return json({ ok: true, moved });
    }
    if (old && M === 'DELETE') {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM jd_docs WHERE deleted = 0 AND json_extract(data, '$.category') = ?").bind(old).first();
      if (n.n) throw bad(`이 카테고리로 묶인 문서가 ${n.n}개 있어 지울 수 없습니다. 이름을 바꾸거나 문서의 카테고리를 먼저 바꿔 주세요.`);
      await db.prepare('DELETE FROM jd_clients WHERE name = ?').bind(old).run();
      return json({ ok: true });
    }
    throw bad('지원하지 않는 요청입니다.', 405);
  }

  // 템플릿: 불러와서 고친 뒤 새 문서로 저장하는 원본
  if (p === '/templates' || p.startsWith('/templates/')) {
    const tid = +(p.split('/')[2] || 0);
    if (!tid && M === 'GET') {
      const r = await db.prepare('SELECT id, name, type, data, updated_at FROM jd_templates ORDER BY sort DESC, id DESC').all();
      return json({ ok: true, templates: r.results.map((t) => ({ id: t.id, name: t.name, type: t.type, doc: JSON.parse(t.data), updated_at: t.updated_at })) });
    }
    const b = M === 'POST' || M === 'PUT' ? await readBody(request) : {};
    const name = String(b.name || '').trim().slice(0, 80);
    if (!tid && M === 'POST') {
      if (!name) throw bad('템플릿 이름을 넣어 주세요.');
      const d = clean(b.doc, { needDate: false });   // 템플릿은 카테고리 없이도 저장(불러온 뒤 문서로 저장할 때 고름)
      const r = await db.prepare('INSERT INTO jd_templates(name, type, data, sort, updated_at) VALUES(?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM jd_templates), ?) RETURNING id').bind(name, d.type, JSON.stringify(d), now).first();
      return json({ ok: true, id: r.id });
    }
    if (tid && M === 'PUT') {
      const sets = [], vals = [];
      if (name) { sets.push('name = ?'); vals.push(name); }
      if (b.doc) { const d = clean(b.doc, { needDate: false }); sets.push('type = ?', 'data = ?'); vals.push(d.type, JSON.stringify(d)); }
      if (!sets.length) throw bad('바꿀 내용이 없습니다.');
      await db.prepare(`UPDATE jd_templates SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...vals, now, tid).run();
      return json({ ok: true });
    }
    if (tid && M === 'DELETE') {
      await db.prepare('DELETE FROM jd_templates WHERE id = ?').bind(tid).run();
      return json({ ok: true });
    }
    throw bad('지원하지 않는 요청입니다.', 405);
  }

  if (p === '/docs' && M === 'GET') {
    const sp = url.searchParams;
    const q = (sp.get('q') || '').trim().toLowerCase();
    const type = sp.get('type') || '', cat = (sp.get('cat') || '').trim(), year = sp.get('year') || '';
    const trash = sp.get('trash') === '1' ? 1 : 0;
    const limit = Math.min(500, Math.max(1, +sp.get('limit') || 200));
    const where = ['deleted = ?'], args = [trash];
    if (type) { where.push('type = ?'); args.push(type); }
    if (cat) { where.push("json_extract(data, '$.category') = ?"); args.push(cat); }
    if (/^\d{4}$/.test(year)) { where.push('doc_date LIKE ?'); args.push(`${year}-%`); }
    for (const w of q.split(/\s+/).filter(Boolean).slice(0, 6).map((x) => x.slice(0, 15))) {   // D1 은 LIKE 글자가 길면 오류를 낸다
      const digits = w.replace(/,/g, '');
      if (/^\d{4,}$/.test(digits)) { where.push('(search LIKE ? OR CAST(amount AS TEXT) LIKE ?)'); args.push(`%${w}%`, `%${digits}%`); }
      else { where.push('search LIKE ?'); args.push(`%${w}%`); }
    }
    // 페이지 나눔: per(한 쪽 개수) · page(1부터). per 가 없으면 limit 개
    const per = Math.min(100, Math.max(0, +sp.get('per') || 0));
    const page = Math.max(1, +sp.get('page') || 1);
    const [rs, years, cnt] = await db.batch([
      db.prepare(`SELECT ${ROW} FROM jd_docs WHERE ${where.join(' AND ')} ORDER BY doc_date DESC, no DESC LIMIT ? OFFSET ?`).bind(...args, per || limit, per ? (page - 1) * per : 0),
      db.prepare('SELECT DISTINCT substr(doc_date, 1, 4) AS y FROM jd_docs WHERE deleted = 0 ORDER BY y DESC'),
      db.prepare(`SELECT COUNT(*) AS n FROM jd_docs WHERE ${where.join(' AND ')}`).bind(...args),
    ]);
    return json({ ok: true, docs: rs.results, years: years.results.map((r) => r.y).filter(Boolean), total: cnt.results[0].n, page, per });
  }

  if (p === '/docs' && M === 'POST') {
    const b = await readBody(request);
    const d = clean(b.doc);
    needCategory(d);
    const no = await nextNo(db, d.date);
    d.no = no;
    delete d.id;
    const r = await db.prepare(`INSERT INTO jd_docs(no, type, title, client, doc_date, amount, vat, search, data, parent_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
      .bind(no, d.type, d.title || '', d.client?.name || '', d.date || '', Math.round(+b.amount || 0), d.vat || '', searchText(d), JSON.stringify(d), d.parentId || null, now, now).first();
    await addClient(db, d.category, now);
    const slug = await setSlug(db, r.id);
    await audit('JDOCS_NEW', `${TYPE_NAME[d.type]} ${no}`, d.client?.name || '');
    return json({ ok: true, id: r.id, no, version: 1, slug });
  }

  const m = /^\/docs\/(\d+)(?:\/(renumber|restore))?$/.exec(p);
  if (m) {
    const id = +m[1];
    if (!m[2] && M === 'GET') {
      const [r0, rk, rp, rv] = await db.batch([
        db.prepare('SELECT * FROM jd_docs WHERE id = ?').bind(id),
        db.prepare('SELECT id, no, type, deleted FROM jd_docs WHERE parent_id = ? AND deleted = 0 ORDER BY id').bind(id),
        db.prepare('SELECT p.id, p.no, p.type FROM jd_docs d JOIN jd_docs p ON p.id = d.parent_id WHERE d.id = ?').bind(id),
        db.prepare('SELECT o.no, o.amount, o.doc_date FROM jd_docs d JOIN jd_docs o ON o.client = d.client AND o.id != d.id AND o.deleted = 0 AND o.type = d.type WHERE d.id = ? ORDER BY o.doc_date DESC LIMIT 1').bind(id),
      ]);
      const row = r0.results[0];
      if (!row) throw bad('문서를 찾을 수 없습니다.', 404);
      const doc = JSON.parse(row.data);
      doc.no = row.no;
      return json({ ok: true, id, version: row.version, deleted: row.deleted, doc, children: rk.results, parent: rp.results[0] || null, prev: rv.results[0] || null, updated_at: row.updated_at, slug: row.slug || await setSlug(db, id) });
    }
    const row = await db.prepare('SELECT * FROM jd_docs WHERE id = ?').bind(id).first();
    if (!row) throw bad('문서를 찾을 수 없습니다.', 404);
    if (!m[2] && M === 'PUT') {
      const b = await readBody(request);
      const d = clean(b.doc);
      needCategory(d);
      const stale = '다른 창에서 이 문서를 먼저 고쳤습니다. 새로고침 후 다시 저장해 주세요.';
      if (+b.version !== row.version) throw bad(stale, 409);
      d.no = row.no;
      const v = row.version + 1;
      const r = await db.prepare('UPDATE jd_docs SET type = ?, title = ?, client = ?, doc_date = ?, amount = ?, vat = ?, search = ?, data = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?')
        .bind(d.type, d.title || '', d.client?.name || '', d.date || '', Math.round(+b.amount || 0), d.vat || '', searchText(d), JSON.stringify(d), v, now, id, row.version).run();
      if (!changes(r)) throw bad(stale, 409);
      await addClient(db, d.category, now);
      return json({ ok: true, id, no: row.no, version: v, updated_at: now });
    }
    if (m[2] === 'renumber' && M === 'POST') {
      const d = JSON.parse(row.data);
      const no = await nextNo(db, d.date);
      d.no = no;
      await db.prepare('UPDATE jd_docs SET no = ?, data = ?, search = ?, version = version + 1, updated_at = ? WHERE id = ?').bind(no, JSON.stringify(d), searchText(d), now, id).run();
      return json({ ok: true, no, version: row.version + 1 });
    }
    if (!m[2] && M === 'DELETE' && url.searchParams.get('hard') === '1') {
      if (!row.deleted) throw bad('휴지통에 있는 문서만 완전히 지울 수 있습니다.');
      await db.batch([
        db.prepare('UPDATE jd_docs SET parent_id = NULL WHERE parent_id = ?').bind(id),
        db.prepare('DELETE FROM jd_docs WHERE id = ? AND deleted = 1').bind(id),
      ]);
      await audit('JDOCS_DEL', `${TYPE_NAME[row.type] || '문서'} ${row.no}`, row.client || '');
      return json({ ok: true });
    }
    if (!m[2] && M === 'DELETE') {
      await db.prepare('UPDATE jd_docs SET deleted = 1, updated_at = ? WHERE id = ?').bind(now, id).run();
      return json({ ok: true });
    }
    if (m[2] === 'restore' && M === 'POST') {
      await db.prepare('UPDATE jd_docs SET deleted = 0, updated_at = ? WHERE id = ?').bind(now, id).run();
      return json({ ok: true });
    }
  }
  return null;
}

// ───────── 고객 화면 · API — 로그인 없음, 주소(6자)를 아는 사람만 ─────────
// 밖에 보여 줄 문서: 내부 메모 · 목표 금액 · 카테고리 · 단가 계산식(노임단가 × 적용률)은 빼고 일단가만 남긴다
function publicDoc(row) {
  const d = JSON.parse(row.data);
  d.no = row.no;
  ['memo', 'target', 'author', 'authorId', 'editor', 'editedAt', 'category', 'tplId', 'tplName', 'parentId', 'id'].forEach((k) => delete d[k]);
  if (d.rate) {
    const r = d.rate;
    const direct = r.mode === 'direct' ? Math.round(numOf(r.direct)) : Math.round(numOf(r.base) * numOf(r.factor));
    d.rate = { mode: 'direct', direct, byCat: !!r.byCat };
  }
  return d;
}

// 밖에 보여 줄 회사 정보: 그 문서 종류에 실제로 찍히는 칸만, 계좌는 그 문서가 쓰는 하나만
const PUBLIC_CO = { letter: ['name', 'nameEn', 'ceo', 'tel', 'fax', 'email'], other: ['name', 'ceo', 'bizNo', 'bizType', 'bizItem', 'tel', 'fax'] };
function publicCompany(company, doc) {
  const c = isObj(company) ? company : {};
  const out = {};
  for (const k of PUBLIC_CO[doc.type === 'letter' ? 'letter' : 'other']) if (typeof c[k] === 'string') out[k] = c[k];
  const key = doc.account === 'personal' || doc.account === 'business' ? doc.account : (doc.vat === 'incl' ? 'business' : 'personal');
  const acc = isObj(c.accounts) && typeof c.accounts[key] === 'string' ? c.accounts[key] : '';
  out.accounts = { [key]: acc };
  return out;
}

function pageHtml({ title, desc, type, origin, path, ver, gone = false }) {
  const img = `${origin}/img/jd/og-${TYPE_NAME[type] ? type : 'letter'}.jpg`;
  // 문서를 폰에서 확대해 읽을 수 있게 두 손가락 확대를 열어 둔다
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escH(title)}</title>
<meta name="description" content="${escH(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="J-Docs">
<meta property="og:title" content="${escH(title)}">
<meta property="og:description" content="${escH(desc)}">
<meta property="og:url" content="${escH(origin + path)}">
<meta property="og:image" content="${escH(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%233b4cca'/%3E%3Cpath d='M18 8v11a4 4 0 0 1-8 0' fill='none' stroke='white' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/css/jdocs.css?v=${ver}">
</head>
<body class="pv">
<header class="pv-top"><div class="pv-top-in"><span class="pv-brand">J-Docs</span><b class="pv-title" id="pvTitle">${escH(gone ? '' : title)}</b><span class="pv-tools" id="pvTools"></span></div></header>
<main class="pv-main" id="pvMain">${gone ? `<p class="pv-msg"><b>${escH(title)}</b><br>${escH(desc)}</p>` : '<p class="pv-msg" id="pvLoading">문서를 불러오는 중…</p>'}</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
${gone ? '' : `<script type="module" src="/js/jd/view.js?v=${ver}"></script>`}
</body>
</html>`;
}
const page = (opt, status = 200) => new Response(pageHtml(opt), { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY' } });

// 반환: Response, 또는 null(이 길이 아님)
export async function jdocsPublic(request, env, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const pm = /^\/api\/jdp\/([A-Za-z0-9]{6})(?:\/(stamp|seal))?$/.exec(p);
  const vm = pm ? null : /^\/d\/([^/]+)$/.exec(p);
  if (!pm && !vm) return null;
  const db = env.DB;
  const ver = String(env.VER?.id || 'dev').slice(0, 8);
  const slug = pm ? pm[1] : vm[1];
  const none = { title: '문서를 찾을 수 없습니다', desc: '주소가 바뀌었거나 지워진 문서입니다.', type: 'letter', origin: url.origin, path: p, ver, gone: true };

  // 없는 주소를 여러 번 두드리면 잠깐 막는다 — 맞는 주소는 언제나 열린다(같은 공유기를 쓰는 다른 사람까지 막지 않게). IPv6 는 앞 64비트로 묶는다
  const row = SLUG_RE.test(slug) ? await db.prepare('SELECT id, no, type, title, data, deleted FROM jd_docs WHERE slug = ?').bind(slug).first() : null;
  if (!row || row.deleted) {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const key = `jdocs:${ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip}`;
    const t = Date.now();
    const [, fails] = await db.batch([
      db.prepare("DELETE FROM login_fails WHERE key LIKE 'jdocs:%' AND at < ?").bind(t - FAIL_WINDOW),
      db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE key = ? AND at > ?').bind(key, t - FAIL_WINDOW),
    ]);
    if (fails.results[0].n >= FAIL_MAX) return pm ? json({ ok: false, error: '잠시 뒤에 다시 열어 주세요.' }, 429) : page({ ...none, title: '잠시 뒤에 다시 열어 주세요', desc: '없는 주소를 여러 번 열어 잠깐 막아 두었습니다.' }, 429);
    await db.prepare('INSERT INTO login_fails (key, at) VALUES (?, ?)').bind(key, t).run();
    return pm ? json({ ok: false, error: '문서를 찾을 수 없습니다.' }, 404) : page(none, 404);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ ok: false, error: '지원하지 않는 요청입니다.' }, 405);

  if (vm) {
    // 화면: 카톡 · 문자에 붙였을 때 보이는 제목 · 그림(문서 종류마다 다름)을 여기서 넣는다
    const tn = TYPE_NAME[row.type] || '문서';
    return page({ title: String(row.title || '').trim() || tn, desc: `${tn}${row.type === 'letter' ? '을' : '를'} 보내 드립니다. 링크를 열어 확인해 주세요.`, type: row.type, origin: url.origin, path: p, ver });
  }
  const doc = publicDoc(row);
  if (pm[2]) return doc.stamp === false ? new Response(null, { status: 404 }) : stampImage(db);
  const { settings } = await getSettings(db);
  return json({ ok: true, doc, company: publicCompany(settings?.company, doc) });
}
