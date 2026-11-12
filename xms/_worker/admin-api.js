// xms 관리자 API (/xms-api/admin/*) — 등급 1(관리자) 또는 xim 에서 대신 들어온 운영자만
import { removePostFiles, claimForRequest, uploadIdsIn } from './uploads.js';
import { deleteRequest } from '../../xim/_worker/request-files.js'; // xim 과 같은 코드
import {
  DAY, now, bad, forbidden, notFound, json, str, body, audit, isAdmin, siteSettings, saveSettings, BUILTIN_FIELDS,
  MEMBER_COLUMNS, LOCKED_REQUIRED, maskFrom, levelsOf, ALL_LEVELS, newPassword, hashPassword, sameText, sanitizeHtml, HttpError, ensureDocs,
} from './lib.js';
import { settingsApi } from './site-meta.js';
import { usageOf } from './usage.js';
import { popupsApi } from './popups.js';
import { statsApi } from './visits.js';
import { adminCourses, featureOn } from './courses.js';
import { adminApply } from './apply.js';

const PAGE = 20;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const RESERVED = new Set(['admin', 'member', 'board', 'xms', 'xms-api', 'xim-api', 'api', 'css', 'js', 'images', 'assets']);
const LAYOUTS = ['TABLE', 'CARD', 'BLOG'];
const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'RADIO', 'CHECKBOX'];
const MODES = ['REQUIRED', 'OPTIONAL', 'EXCLUDED'];

// 사용량(무거운 계산) 5분 기억 — 사이트마다
const usageMem = new Map();
async function usageCached(env, site) {
  const hit = usageMem.get(site);
  if (hit && Date.now() - hit.at < 300000) return hit.u;
  const u = await usageOf(env, site);
  usageMem.set(site, { u, at: Date.now() });
  return u;
}

export async function adminApi(ctx) {
  const { request, env, site, me, url } = ctx;
  if (!isAdmin(me)) throw new HttpError(me.kind === 'guest' ? 401 : 403, me.kind === 'guest' ? '로그인이 필요합니다.' : '관리자만 들어올 수 있습니다.');
  const db = env.DB;
  const path = url.pathname.replace(/^\/xms-api\/admin/, '').replace(/\/+$/, '') || '/';
  const method = request.method;
  const q = url.searchParams;
  let m;

  // ───── 공통 정보 ─────
  if (path === '/me') {
    // 셋을 한꺼번에 (차례로 기다리면 느리다). 사용량은 계산이 무거워 5분 기억해 둔다 — 화면 위 '사용 중' 숫자에만 쓴다
    const [s, { levelNames }, u] = await Promise.all([
      env.XIM_DB.prepare('SELECT name, domain, quota_mb, used_mb, status FROM sites WHERE slug = ?').bind(site).first(),
      siteSettings(db, site),
      usageCached(env, site),
    ]);
    return json({
      site: { slug: site, name: s?.name || site, domain: s?.domain || '', quota_mb: s?.quota_mb ?? 0, used_mb: Math.round((u.files / 1048576) * 10) / 10, status: s?.status },
      me: me.kind === 'staff' ? { staff: true, name: '운영자' } : { staff: false, name: me.member.name, login_id: me.member.login_id },
      levelNames,
      features: { courses: await featureOn(db, site, 'courses'), apply: await featureOn(db, site, 'apply') },
    });
  }
  // 부가 기능: 맨 위로 버튼 (스크롤하면 오른쪽 아래)
  if (path === '/options/top') {
    if (method === 'PUT') {
      const b = await body(request);
      const except = (Array.isArray(b.except) ? b.except : String(b.except || '').split('\n')).map((x) => str(x, 100)).filter((x) => x.startsWith('/')).slice(0, 30);
      const v = JSON.stringify({ on: !!b.on, except });
      await db.prepare("INSERT INTO site_options (site, k, v, updated_at) VALUES (?, 'top_button', ?, ?) ON CONFLICT(site, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(site, v, now()).run();
      await audit(db, site, me, request, 'TOP_BUTTON', b.on ? '켬' : '끔', except.join(' '));
      return json({ ok: true });
    }
    const r = await db.prepare("SELECT v FROM site_options WHERE site = ? AND k = 'top_button'").bind(site).first();
    let v = { on: true, except: [] };   // 기본 켬 (사용자 지시 2026-11-12)
    try { if (r) v = { ...v, ...JSON.parse(r.v) }; } catch { /* 기본값 */ }
    return json(v);
  }
  // 강의 (기능을 켠 사이트만)
  if (path.startsWith('/apply')) {
    const r = await adminApply(ctx, path, method);
    if (r) return r;
  }
  if (path.startsWith('/courses')) {
    const r = await adminCourses(ctx, path, method);
    if (r) return r;
  }

  if (path === '/usage' && method === 'GET') return json(await usageOf(env, site));

  // ───── 수정 모드: 홈페이지 위에서 고친 글자 (글자만 — 태그 · 모양은 사이트 그대로) ─────
  if (path === '/page-texts' && method === 'POST') {
    const b = await body(request);
    const page = pageKey(b.path);
    const items = Array.isArray(b.items) ? b.items.slice(0, 300) : [];
    if (!items.length) throw bad('고친 글자가 없습니다.');
    const stmts = [];
    for (const it of items) {
      const k = String(it.k || '');
      if (!/^[0-9a-z]{1,8}\.\d{1,4}$/.test(k)) continue;
      const pth = it.g === '*' ? '*' : page;
      if (it.t === null) { stmts.push(db.prepare('DELETE FROM page_texts WHERE site = ? AND path = ? AND k = ?').bind(site, pth, k)); continue; }
      if (!Array.isArray(it.t) || it.t.length > 200) continue;
      const t = JSON.stringify(it.t.map((x) => String(x ?? '').slice(0, 5000)));
      if (t.length > 20000) throw bad('글자가 너무 깁니다.');
      stmts.push(db.prepare('INSERT INTO page_texts (site, path, k, t, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(site, path, k) DO UPDATE SET t = excluded.t, updated_at = excluded.updated_at').bind(site, pth, k, t, now()));
    }
    if (stmts.length) await db.batch(stmts);
    await audit(db, site, me, request, '글자 수정', page, `${stmts.length}곳`);
    return json({ ok: true, saved: stmts.length });
  }
  if (path === '/stats' && method === 'GET') return statsApi(db, site, q);

  // ───── 회원 ─────
  if (path === '/members' && method === 'GET') return json(await listMembers(db, site, q, false));
  if (path === '/members/withdrawn' && method === 'GET') return json(await listMembers(db, site, q, true));
  if (path === '/members/export' && method === 'GET') {
    const withdrawn = q.get('withdrawn') === '1';
    const data = await listMembers(db, site, q, withdrawn, true);
    await audit(db, site, me, request, 'MEMBER_EXPORT', withdrawn ? '탈퇴회원' : '가입회원', `${data.rows.length}명`);
    return csvResponse(data, withdrawn);
  }
  if ((m = path.match(/^\/members\/(\d+)$/)) && method === 'GET') {
    const row = await member(db, site, +m[1]);
    return json(row);
  }
  if ((m = path.match(/^\/members\/(\d+)\/level$/)) && method === 'POST') {
    const t = await member(db, site, +m[1]);
    const level = Number((await body(request)).level);
    if (!(level >= 1 && level <= 10)) throw bad('등급이 잘못됐습니다.');
    if (t.level === 1 && level !== 1) await keepOneAdmin(db, site);
    await db.prepare('UPDATE members SET level = ? WHERE id = ?').bind(level, t.id).run();
    const { levelNames } = await siteSettings(db, site);
    await audit(db, site, me, request, 'MEMBER_LEVEL', `${t.name}(${t.login_id})`, `${levelNames[t.level]} → ${levelNames[level]}`);
    return json({ ok: true });
  }
  if ((m = path.match(/^\/members\/(\d+)\/lock$/)) && method === 'POST') {
    const t = await member(db, site, +m[1]);
    const locked = !!(await body(request)).locked;
    if (locked && t.level === 1) await keepOneAdmin(db, site);
    await db.prepare('UPDATE members SET status = ?, fail_count = 0, locked_until = 0 WHERE id = ?').bind(locked ? 'LOCKED' : 'ACTIVE', t.id).run();
    if (locked) await db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(t.id).run();
    await audit(db, site, me, request, locked ? 'MEMBER_LOCK' : 'MEMBER_UNLOCK', `${t.name}(${t.login_id})`);
    return json({ ok: true });
  }
  if ((m = path.match(/^\/members\/(\d+)\/temp-password$/)) && method === 'POST') {
    const t = await member(db, site, +m[1]);
    const pw = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const p = await newPassword(pw);
    await db.prepare('UPDATE members SET pw_hash = ?, pw_salt = ?, fail_count = 0, locked_until = 0 WHERE id = ?').bind(p.pw_hash, p.pw_salt, t.id).run();
    await db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(t.id).run();
    await audit(db, site, me, request, 'TEMP_PASSWORD', `${t.name}(${t.login_id})`);
    return json({ password: pw, who: `${t.name}(${t.login_id})` });
  }
  if ((m = path.match(/^\/members\/(\d+)\/withdraw$/)) && method === 'POST') {
    const t = await member(db, site, +m[1]);
    if (t.level === 1) await keepOneAdmin(db, site);
    await db.prepare("UPDATE members SET status = 'WITHDRAWN', withdrawn_at = ?, withdraw_reason = '관리자 처리' WHERE id = ?").bind(now(), t.id).run();
    await db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(t.id).run();
    await audit(db, site, me, request, 'MEMBER_WITHDRAW', `${t.name}(${t.login_id})`);
    return json({ ok: true });
  }

  // 탈퇴회원 기록 삭제 → 그 아이디(이메일)로 다시 가입할 수 있다. 쓴 글 · 댓글은 글쓴이 이름 그대로 남는다.
  if ((m = path.match(/^\/members\/(\d+)$/)) && method === 'DELETE') {
    const t = await db.prepare("SELECT id, name, login_id FROM members WHERE id = ? AND site = ? AND status = 'WITHDRAWN'").bind(+m[1], site).first();
    if (!t) throw bad('탈퇴한 회원만 삭제할 수 있습니다.');
    await db.batch([
      db.prepare('DELETE FROM member_agreements WHERE member_id = ?').bind(t.id),
      db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(t.id),
      db.prepare('DELETE FROM members WHERE id = ?').bind(t.id),
    ]);
    await audit(db, site, me, request, 'MEMBER_DELETE', `${t.name}(${t.login_id})`, '탈퇴회원 기록 삭제');
    return json({ ok: true });
  }

  // ───── 등급 이름 ─────
  if (path === '/levels' && method === 'GET') {
    const { levelNames } = await siteSettings(db, site);
    const { results } = await db.prepare("SELECT level, COUNT(*) AS n FROM members WHERE site = ? AND status != 'WITHDRAWN' GROUP BY level").bind(site).all();
    const counts = Object.fromEntries(results.map((r) => [r.level, r.n]));
    return json({ levelNames, counts });
  }
  if (path === '/levels' && method === 'PUT') {
    const { names } = await body(request);
    const out = {};
    for (let i = 1; i <= 10; i++) { const v = str(names?.[i], 20); if (v) out[i] = v; }
    await saveSettings(db, site, { levelNames: out });
    await audit(db, site, me, request, 'LEVEL_NAMES', '등급 이름');
    return json({ ok: true });
  }

  // ───── 가입 항목 ─────
  if (path === '/fields' && method === 'GET') {
    const { fields } = await siteSettings(db, site);
    const usage = await fieldUsage(db, site, fields);
    return json({ fields: fields.map((f) => ({ ...f, used: usage[f.key] || 0 })), total: usage.__total });
  }
  if (path === '/fields' && method === 'PUT') {
    const { fields: input } = await body(request);
    const { fields: cur } = await siteSettings(db, site);
    if (!Array.isArray(input)) throw bad('항목 목록이 없습니다.');
    const keys = new Set(input.map((f) => f.key));
    for (const f of cur) if (f.builtin && !keys.has(f.key)) throw bad('기본 제공 항목은 지울 수 없습니다.');
    const out = input.map((f, i) => {
      const old = cur.find((c) => c.key === f.key);
      if (!old) throw bad(`없는 항목입니다: ${f.key}`);
      return normField({ ...old, label: f.label, mode: f.mode, options: f.options ?? old.options }, i);
    });
    await saveSettings(db, site, { fields: out });
    await audit(db, site, me, request, 'SIGNUP_FIELDS', '가입 항목');
    return json({ ok: true });
  }
  if (path === '/fields' && method === 'POST') {
    const raw = await body(request);
    const { fields: cur } = await siteSettings(db, site);
    const key = str(raw.key, 30);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,29}$/.test(key)) throw bad('항목 키는 영문으로 시작하고 영문·숫자·밑줄(_)만 쓸 수 있습니다.');
    if (cur.some((f) => f.key === key) || BUILTIN_FIELDS.some((f) => f.key === key) || ['login_id', 'password', 'level', 'phone'].includes(key)) throw bad('이미 있는 항목 키입니다.');
    const f = normField({ key, label: raw.label, mode: raw.mode, type: raw.type, options: raw.options }, cur.length);
    await saveSettings(db, site, { fields: [...cur, f] });
    await audit(db, site, me, request, 'SIGNUP_FIELD_ADD', f.label);
    return json({ ok: true });
  }
  if ((m = path.match(/^\/fields\/([A-Za-z][A-Za-z0-9_]*)$/)) && method === 'DELETE') {
    const { fields: cur } = await siteSettings(db, site);
    const f = cur.find((x) => x.key === m[1]);
    if (!f) throw notFound('없는 항목입니다.');
    if (f.builtin) throw bad('기본 제공 항목은 지울 수 없습니다. "안 받음" 으로 바꿔 주세요.');
    await saveSettings(db, site, { fields: cur.filter((x) => x.key !== f.key) });
    await audit(db, site, me, request, 'SIGNUP_FIELD_DELETE', f.label);
    return json({ ok: true });
  }

  // ───── 약관 · 개인정보 처리방침 ─────
  if ((m = path.match(/^\/documents\/(terms|privacy)$/))) {
    const type = m[1].toUpperCase();
    if (method === 'GET') {
      await ensureDocs(env, site);
      const { results } = await db.prepare('SELECT id, version, content, published_at FROM documents WHERE site = ? AND doc_type = ? ORDER BY version DESC').bind(site, type).all();
      return json({ current: results[0] || null, history: results.slice(1).map(({ content, ...r }) => r), template: '' });
    }
    if (method === 'POST') {
      const content = await sanitizeHtml((await body(request)).content);
      if (!content.replace(/<[^>]*>/g, '').trim()) throw bad('내용을 넣어 주세요.');
      const last = await db.prepare('SELECT MAX(version) AS v FROM documents WHERE site = ? AND doc_type = ?').bind(site, type).first();
      const v = (last?.v || 0) + 1;
      await db.prepare('INSERT INTO documents (site, doc_type, version, content, published_at) VALUES (?, ?, ?, ?, ?)').bind(site, type, v, content, now()).run();
      await audit(db, site, me, request, 'DOC_PUBLISH', type === 'TERMS' ? '이용약관' : '개인정보 처리방침', `v${v}`);
      return json({ ok: true, version: v });
    }
  }
  if ((m = path.match(/^\/documents\/(terms|privacy)\/(\d+)$/)) && method === 'GET') {
    const d = await db.prepare('SELECT * FROM documents WHERE site = ? AND doc_type = ? AND version = ?').bind(site, m[1].toUpperCase(), +m[2]).first();
    if (!d) throw notFound();
    return json(d);
  }

  // ───── 게시판 ─────
  if (path === '/boards' && method === 'GET') {
    // 30일 지난 보관함은 완전히 지운다
    const old = now() - 30 * DAY;
    const { results: gone } = await db.prepare('SELECT id FROM boards WHERE site = ? AND deleted_at IS NOT NULL AND deleted_at < ?').bind(site, old).all();
    for (const b of gone) {
      const { results: ps } = await db.prepare('SELECT id FROM posts WHERE board_id = ?').bind(b.id).all();
      for (let i = 0; i < ps.length; i += 90) await removePostFiles(env, site, ps.slice(i, i + 90).map((x) => x.id));
      await db.batch([
        db.prepare('DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE board_id = ?)').bind(b.id),
        db.prepare('DELETE FROM posts WHERE board_id = ?').bind(b.id),
        db.prepare('DELETE FROM boards WHERE id = ?').bind(b.id),
      ]);
    }
    const { results } = await db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM posts p WHERE p.board_id = b.id AND p.deleted_at IS NULL) AS post_count
      FROM boards b WHERE b.site = ? ORDER BY b.sort, b.id`).bind(site).all();
    const { results: menus } = await db.prepare('SELECT id, parent_id, title, board_id FROM menus WHERE site = ?').bind(site).all();
    const menuPath = (mn) => { const names = []; let c = mn; let guard = 0; while (c && guard++ < 20) { names.unshift(c.title); c = menus.find((x) => x.id === c.parent_id); } return names.join(' › '); };
    const rows = results.map((b) => {
      const mn = menus.find((x) => x.board_id === b.id);
      return { ...boardOut(b), post_count: b.post_count, menu: mn ? menuPath(mn) : '' };
    });
    return json({ boards: rows.filter((b) => !b.deleted_at), trash: rows.filter((b) => b.deleted_at) });
  }
  if (path === '/boards' && method === 'POST') {
    const raw = await body(request);
    const b = await boardFields(db, site, raw, null);
    const max = await db.prepare('SELECT MAX(sort) AS s FROM boards WHERE site = ?').bind(site).first();
    const r = await db.prepare(`INSERT INTO boards (site, slug, name, list_layout, list_levels, read_levels, write_levels, comment_levels,
      allow_guest_list, allow_guest_read, allow_guest_write, guest_menu, use_comment, use_secret, options, sort, visible, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(site, b.slug, b.name, b.list_layout, b.list_levels, b.read_levels, b.write_levels, b.comment_levels, b.allow_guest_list,
        b.allow_guest_read, b.allow_guest_write, b.guest_menu, b.use_comment, b.use_secret, b.options, (max?.s || 0) + 1, now()).run();
    const id = r.meta.last_row_id;
    if (raw.attach_menu) {
      const parent = raw.parent_menu_id ? Number(raw.parent_menu_id) : null;
      await insertMenu(db, site, { title: b.name, menu_type: 'BOARD', path: '', board_id: id, parent_id: parent, read_levels: null, allow_guest_read: 1 });
    }
    await audit(db, site, me, request, 'BOARD_CREATE', b.name, `/board/${b.slug}`);
    return json({ id });
  }
  if (path === '/boards/order' && method === 'PUT') {
    const { ids } = await body(request);
    if (!Array.isArray(ids)) throw bad('순서가 없습니다.');
    await db.batch(ids.map((id, i) => db.prepare('UPDATE boards SET sort = ? WHERE id = ? AND site = ?').bind(i + 1, Number(id), site)));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/boards\/(\d+)$/))) {
    const b = await db.prepare('SELECT * FROM boards WHERE id = ? AND site = ?').bind(+m[1], site).first();
    if (!b) throw notFound('없는 게시판입니다.');
    if (method === 'GET') {
      const pc = await db.prepare('SELECT COUNT(*) AS n FROM posts WHERE board_id = ? AND deleted_at IS NULL').bind(b.id).first();
      const mn = await db.prepare('SELECT id, title FROM menus WHERE board_id = ? AND site = ?').bind(b.id, site).first();
      return json({ ...boardOut(b), post_count: pc.n, menu: mn?.title || '' });
    }
    if (method === 'PUT') {
      if (b.deleted_at) throw bad('보관함에 있는 게시판입니다. 먼저 되살려 주세요.');
      const raw = await body(request);
      const n = await boardFields(db, site, raw, b);
      await db.prepare(`UPDATE boards SET slug = ?, name = ?, list_layout = ?, list_levels = ?, read_levels = ?, write_levels = ?, comment_levels = ?,
        allow_guest_list = ?, allow_guest_read = ?, allow_guest_write = ?, guest_menu = ?, use_comment = ?, use_secret = ?, options = ?, visible = ? WHERE id = ?`)
        .bind(n.slug, n.name, n.list_layout, n.list_levels, n.read_levels, n.write_levels, n.comment_levels, n.allow_guest_list, n.allow_guest_read,
          n.allow_guest_write, n.guest_menu, n.use_comment, n.use_secret, n.options, raw.visible === false ? 0 : 1, b.id).run();
      await audit(db, site, me, request, 'BOARD_UPDATE', n.name);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await db.batch([
        db.prepare('UPDATE boards SET deleted_at = ? WHERE id = ?').bind(now(), b.id),
        db.prepare('DELETE FROM menus WHERE board_id = ? AND site = ?').bind(b.id, site),
      ]);
      await audit(db, site, me, request, 'BOARD_DELETE', b.name, '30일 보관');
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/boards\/(\d+)\/restore$/)) && method === 'POST') {
    const b = await db.prepare('SELECT * FROM boards WHERE id = ? AND site = ? AND deleted_at IS NOT NULL').bind(+m[1], site).first();
    if (!b) throw notFound('보관함에 없는 게시판입니다.');
    const taken = await db.prepare('SELECT id FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL').bind(site, b.slug).first();
    if (taken) throw bad(`주소 /board/${b.slug} 를 다른 게시판이 쓰고 있어 되살릴 수 없습니다. 그 게시판 주소를 먼저 바꿔 주세요.`);
    await db.prepare('UPDATE boards SET deleted_at = NULL WHERE id = ?').bind(b.id).run();
    await audit(db, site, me, request, 'BOARD_RESTORE', b.name);
    return json({ ok: true });
  }

  // ───── 메뉴 ─────
  if (path === '/menus' && method === 'GET') {
    const { results } = await db.prepare(`SELECT m.*, b.name AS board_name, b.slug AS board_slug FROM menus m
      LEFT JOIN boards b ON b.id = m.board_id WHERE m.site = ? ORDER BY m.sort, m.id`).bind(site).all();
    return json(results.map((r) => ({ ...r, read_levels: r.read_levels === null ? null : levelsOf(r.read_levels) })));
  }
  if (path === '/menus' && method === 'POST') {
    const n = await menuFields(db, site, await body(request), null);
    const id = await insertMenu(db, site, n);
    await audit(db, site, me, request, 'MENU_CREATE', n.title);
    return json({ id });
  }
  if (path === '/menus/tree' && method === 'PUT') {
    const { items } = await body(request);
    if (!Array.isArray(items)) throw bad('메뉴 순서가 없습니다.');
    const { results } = await db.prepare('SELECT id, menu_type FROM menus WHERE site = ?').bind(site).all();
    const known = new Map(results.map((r) => [r.id, r]));
    for (const it of items) {
      if (!known.has(Number(it.id))) throw bad('없는 메뉴가 섞여 있습니다.');
      if (it.parent_id && (!known.has(Number(it.parent_id)) || known.get(Number(it.parent_id)).menu_type === 'LINK')) throw bad('외부 링크 아래에는 메뉴를 넣을 수 없습니다.');
    }
    await db.batch(items.map((it) => db.prepare('UPDATE menus SET parent_id = ?, sort = ? WHERE id = ? AND site = ?')
      .bind(it.parent_id ? Number(it.parent_id) : null, Number(it.sort) || 0, Number(it.id), site)));
    return json({ ok: true });
  }
  if ((m = path.match(/^\/menus\/(\d+)$/))) {
    const cur = await db.prepare('SELECT * FROM menus WHERE id = ? AND site = ?').bind(+m[1], site).first();
    if (!cur) throw notFound('없는 메뉴입니다.');
    if (method === 'PUT') {
      const n = await menuFields(db, site, await body(request), cur);
      await db.prepare('UPDATE menus SET parent_id = ?, title = ?, menu_type = ?, path = ?, board_id = ?, read_levels = ?, allow_guest_read = ? WHERE id = ?')
        .bind(n.parent_id, n.title, n.menu_type, n.path, n.board_id, n.read_levels, n.allow_guest_read, cur.id).run();
      await audit(db, site, me, request, 'MENU_UPDATE', n.title);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      // 아래 메뉴는 한 단계 위로 올린다
      await db.batch([
        db.prepare('UPDATE menus SET parent_id = ? WHERE parent_id = ? AND site = ?').bind(cur.parent_id, cur.id, site),
        db.prepare('DELETE FROM menus WHERE id = ?').bind(cur.id),
      ]);
      await audit(db, site, me, request, 'MENU_DELETE', cur.title);
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/menus\/(\d+)\/visible$/)) && method === 'POST') {
    const v = (await body(request)).visible ? 1 : 0;
    const r = await db.prepare('UPDATE menus SET visible = ? WHERE id = ? AND site = ?').bind(v, +m[1], site).run();
    if (!r.meta.changes) throw notFound('없는 메뉴입니다.');
    await audit(db, site, me, request, v ? 'MENU_SHOW' : 'MENU_HIDE', `#${m[1]}`);
    return json({ ok: true });
  }

  // ───── 수정 요청 (xim 으로 보낸다) ─────
  if (path === '/requests' && method === 'GET') {
    const s = await ximSite(env, site);
    const { results } = await env.XIM_DB.prepare(`SELECT r.id, r.title, r.status, r.reply, r.requester, r.attachments, r.created_at, r.updated_at,
        (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id) AS msg_count,
        (SELECT side FROM request_messages m WHERE m.request_id = r.id ORDER BY m.id DESC LIMIT 1) AS last_side,
        (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id AND m.side = 'op' AND m.created_at > r.site_seen_at) AS site_unread
      FROM requests r WHERE r.site_id = ? ORDER BY r.id DESC LIMIT 300`).bind(s.id).all();
    return json(results.map((r) => ({ ...r, attachments: JSON.parse(r.attachments || '[]') })));
  }
  // 왼쪽 메뉴 숫자: 운영자가 새로 답한 요청 수
  if (path === '/requests/unread' && method === 'GET') {
    const s = await ximSite(env, site);
    const r = await env.XIM_DB.prepare("SELECT COUNT(*) AS n FROM requests r WHERE r.site_id = ? AND (SELECT COUNT(*) FROM request_messages m WHERE m.request_id = r.id AND m.side = 'op' AND m.created_at > r.site_seen_at) > 0").bind(s.id).first();
    return json({ n: r.n });
  }
  // 요청 하나 + 주고받은 글 (요청 → 운영자 답변 → 다시 요청 … 시간 순서)
  if ((m = path.match(/^\/requests\/(\d+)$/)) && method === 'GET') {
    const s = await ximSite(env, site);
    const r = await env.XIM_DB.prepare('SELECT * FROM requests WHERE id = ? AND site_id = ?').bind(+m[1], s.id).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    const { results } = await env.XIM_DB.prepare('SELECT id, side, author, body, attachments, status, created_at FROM request_messages WHERE request_id = ? ORDER BY id').bind(r.id).all();
    await env.XIM_DB.prepare('UPDATE requests SET site_seen_at = ? WHERE id = ?').bind(now(), r.id).run(); // 업체가 읽음
    return json({ ...r, attachments: JSON.parse(r.attachments || '[]'), messages: results.map((x) => ({ ...x, attachments: JSON.parse(x.attachments || '[]') })) });
  }
  // 요청 지우기 (업체 관리자 — 자기 사이트 요청만)
  if ((m = path.match(/^\/requests\/(\d+)$/)) && method === 'DELETE') {
    const s = await ximSite(env, site);
    const r = await env.XIM_DB.prepare('SELECT id, title FROM requests WHERE id = ? AND site_id = ?').bind(+m[1], s.id).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    await deleteRequest(env.XIM_DB, db, env.FILES, r.id, site);
    await audit(db, site, me, request, 'REQUEST_DELETE', r.title);
    return json({ ok: true });
  }
  // 이어서 쓰기 (업체 관리자): 완료된 요청에 쓰면 다시 '접수' 로
  if ((m = path.match(/^\/requests\/(\d+)\/messages$/)) && method === 'POST') {
    const s = await ximSite(env, site);
    const r = await env.XIM_DB.prepare('SELECT id, title, status FROM requests WHERE id = ? AND site_id = ?').bind(+m[1], s.id).first();
    if (!r) throw notFound('요청을 찾을 수 없습니다.');
    const raw = await body(request);
    const text = str(raw.body, 10000);
    const atts = await requestAtts(db, site, raw.attachments);
    if (!text && !atts.length) throw bad('내용을 적거나 파일을 붙여 주세요.');
    const t = now();
    const who = me.kind === 'staff' ? '운영자' : `${me.member.name}(${me.member.login_id})`;
    const next = r.status === 'done' ? 'new' : r.status;
    await env.XIM_DB.batch([
      env.XIM_DB.prepare("INSERT INTO request_messages (request_id, side, author, body, attachments, status, created_at) VALUES (?, 'site', ?, ?, ?, ?, ?)")
        .bind(r.id, who, text, JSON.stringify(atts), next !== r.status ? next : '', t),
      env.XIM_DB.prepare('UPDATE requests SET status = ?, updated_at = ?, site_seen_at = ? WHERE id = ?').bind(next, t, t, r.id),
    ]);
    await claimForRequest(env, site, r.id, atts.map((a) => a.id));
    await audit(db, site, me, request, 'REQUEST_MESSAGE', r.title);
    return json({ ok: true, status: next });
  }
  if (path === '/requests' && method === 'POST') {
    const raw = await body(request);
    const title = str(raw.title, 120);
    if (!title) throw bad('제목을 넣어 주세요.');
    const s = await ximSite(env, site);
    const t = now();
    const who = me.kind === 'staff' ? '운영자' : `${me.member.name}(${me.member.login_id})`;
    // 본문은 에디터 HTML (정리해서), 첨부는 이 사이트에 올라간 파일만
    const html = await sanitizeHtml(String(raw.body ?? '').slice(0, 100000));
    const atts = await requestAtts(db, site, raw.attachments);
    const ins = await env.XIM_DB.prepare('INSERT INTO requests (site_id, admin_id, title, body, status, requester, attachments, created_at, updated_at, site_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(s.id, title, html, 'new', who, JSON.stringify(atts), t, t, t).run();
    await claimForRequest(env, site, ins.meta.last_row_id, [...atts.map((a) => a.id), ...uploadIdsIn(html)]);
    await audit(db, site, me, request, 'REQUEST_CREATE', title);
    return json({ ok: true });
  }

  // ───── 내 계정 · 관리 로그 ─────
  // 운영자 모드(xim 의 xms 버튼): 이 사이트 관리자(등급 1) 비밀번호를 바로 바꾼다 — 지금 비밀번호 없이
  if (path === '/account/admins' && method === 'GET') {
    if (me.kind !== 'staff') throw forbidden();
    const { results } = await db.prepare("SELECT id, name, login_id, last_login_at FROM members WHERE site = ? AND level = 1 AND status != 'WITHDRAWN' ORDER BY id").bind(site).all();
    return json(results);
  }
  if (path === '/account/password' && method === 'POST' && me.kind === 'staff') {
    const raw = await body(request);
    const t = await db.prepare("SELECT id, name, login_id FROM members WHERE id = ? AND site = ? AND level = 1 AND status != 'WITHDRAWN'").bind(Number(raw.member_id) || 0, site).first();
    if (!t) throw bad('바꿀 관리자 계정을 골라 주세요.');
    const next = String(raw.next ?? '');
    if (next.length < 8 || next.length > 200) throw bad('새 비밀번호는 8자 이상으로 넣어 주세요.');
    const p = await newPassword(next);
    await db.batch([
      db.prepare('UPDATE members SET pw_hash = ?, pw_salt = ?, fail_count = 0, locked_until = 0 WHERE id = ?').bind(p.pw_hash, p.pw_salt, t.id),
      db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(t.id), // 그 계정의 다른 로그인은 끊는다
    ]);
    await audit(db, site, me, request, 'PASSWORD_CHANGE', `${t.name}(${t.login_id})`, '운영자가 바꿈');
    return json({ ok: true, who: `${t.name}(${t.login_id})` });
  }
  if (path === '/account/password' && method === 'POST') {
    if (me.kind !== 'member') throw forbidden('운영자로 들어온 화면에서는 바꿀 수 없습니다.');
    const raw = await body(request);
    const ok = sameText(await hashPassword(String(raw.current ?? '').slice(0, 200), me.member.pw_salt), me.member.pw_hash);
    if (!ok) throw bad('지금 비밀번호가 맞지 않습니다.');
    const next = String(raw.next ?? '');
    if (next.length < 8 || next.length > 200) throw bad('새 비밀번호는 8자 이상으로 넣어 주세요.');
    const p = await newPassword(next);
    await db.prepare('UPDATE members SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(p.pw_hash, p.pw_salt, me.member.id).run();
    await db.prepare('DELETE FROM sessions WHERE member_id = ? AND token != ?').bind(me.member.id, me.token).run();
    await audit(db, site, me, request, 'PASSWORD_CHANGE', '내 비밀번호');
    return json({ ok: true });
  }
  if (path === '/audit' && method === 'GET') {
    // 관리 로그는 1개월만 남긴다 (사용자 지시 2026-11-03)
    await db.prepare('DELETE FROM audit_log WHERE site = ? AND created_at < ?').bind(site, now() - 31 * DAY).run();
    const page = Math.max(1, Number(q.get('page')) || 1);
    const total = (await db.prepare('SELECT COUNT(*) AS n FROM audit_log WHERE site = ?').bind(site).first()).n;
    const { results } = await db.prepare('SELECT * FROM audit_log WHERE site = ? ORDER BY id DESC LIMIT ? OFFSET ?').bind(site, 20, (page - 1) * 20).all();
    return json({ total, page, size: 20, rows: results });
  }

  // 파비콘 · 검색엔진 · 카카오톡 미리보기 · 팝업
  const extra = (await settingsApi(ctx, path, method)) || (await popupsApi(ctx, path, method));
  if (extra) return extra;

  throw notFound('없는 주소입니다.');
}

// ───────── 회원 도우미 ─────────
async function member(db, site, id) {
  const m = await db.prepare("SELECT * FROM members WHERE id = ? AND site = ? AND status != 'WITHDRAWN'").bind(id, site).first();
  if (!m) throw notFound('없는 회원입니다.');
  const { pw_hash, pw_salt, ...rest } = m;
  return { ...rest, extra: JSON.parse(m.extra || '{}') };
}
async function keepOneAdmin(db, site) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE site = ? AND level = 1 AND status = 'ACTIVE'").bind(site).first();
  if (r.n <= 1) throw bad('마지막 관리자는 등급을 내리거나 막거나 탈퇴시킬 수 없습니다. 다른 관리자를 먼저 정해 주세요.');
}

async function listMembers(db, site, q, withdrawn, all = false) {
  const { fields, levelNames } = await siteSettings(db, site);
  const where = ['site = ?', withdrawn ? "status = 'WITHDRAWN'" : "status != 'WITHDRAWN'"];
  const args = [site];
  const text = str(q.get('q'), 50);
  if (text) {
    const like = `%${text.replace(/[%_]/g, '')}%`;
    const extraKeys = withdrawn ? [] : fields.filter((f) => !MEMBER_COLUMNS.includes(f.key)).map((f) => f.key);
    const parts = withdrawn ? ['name LIKE ?', 'login_id LIKE ?'] : ['name LIKE ?', 'login_id LIKE ?', 'email LIKE ?', 'mobile LIKE ?', 'nickname LIKE ?'];
    parts.forEach(() => args.push(like));
    if (!withdrawn) {
      const digits = text.replace(/\D/g, '');
      if (digits.length >= 3) { parts.push('mobile LIKE ?'); args.push(`%${digits}%`); }
      for (const k of extraKeys) { parts.push(`json_extract(extra, '$.${k}') LIKE ?`); args.push(like); }
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const level = Number(q.get('level'));
  if (!withdrawn && level >= 1 && level <= 10) { where.push('level = ?'); args.push(level); }
  const missing = q.get('missing');
  const mf = fields.find((f) => f.key === missing && f.mode === 'REQUIRED');
  if (!withdrawn && mf) {
    if (MEMBER_COLUMNS.includes(mf.key)) where.push(`${mf.key} = ''`);
    else where.push(`COALESCE(json_extract(extra, '$.${mf.key}'), '') = ''`);
  }
  const w = where.join(' AND ');
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM members WHERE ${w}`).bind(...args).first()).n;
  const all_ = (await db.prepare(`SELECT COUNT(*) AS n FROM members WHERE site = ? AND ${withdrawn ? "status = 'WITHDRAWN'" : "status != 'WITHDRAWN'"}`).bind(site).first()).n;
  const page = Math.max(1, Number(q.get('page')) || 1);
  const sql = `SELECT * FROM members WHERE ${w} ORDER BY ${withdrawn ? 'withdrawn_at DESC' : 'id DESC'}${all ? '' : ` LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`}`;
  const { results } = await db.prepare(sql).bind(...args).all();
  const rows = results.map(({ pw_hash, pw_salt, ...r }) => ({ ...r, extra: JSON.parse(r.extra || '{}') }));
  return { total, all: all_, page, size: PAGE, rows, fields, levelNames };
}

async function fieldUsage(db, site, fields) {
  const cols = fields.map((f) => (MEMBER_COLUMNS.includes(f.key)
    ? `SUM(CASE WHEN ${f.key} != '' THEN 1 ELSE 0 END) AS "${f.key}"`
    : `SUM(CASE WHEN COALESCE(json_extract(extra, '$.${f.key}'), '') != '' THEN 1 ELSE 0 END) AS "${f.key}"`));
  const r = await db.prepare(`SELECT COUNT(*) AS __total${cols.length ? `, ${cols.join(', ')}` : ''} FROM members WHERE site = ? AND status != 'WITHDRAWN'`).bind(site).first();
  return r || {};
}

function normField(f, sort) {
  const label = str(f.label, 30);
  if (!label) throw bad('이름표를 넣어 주세요.');
  const mode = LOCKED_REQUIRED.includes(f.key) ? 'REQUIRED' : (MODES.includes(f.mode) ? f.mode : 'OPTIONAL');
  const type = FIELD_TYPES.includes(f.type) ? f.type : 'TEXT';
  let options;
  if (['SELECT', 'RADIO', 'CHECKBOX'].includes(type)) {
    const list = (Array.isArray(f.options) ? f.options : String(f.options || '').split('\n')).map((o) => str(o, 50)).filter(Boolean);
    if (list.some((o) => o.includes(','))) throw bad('보기에는 쉼표(,)를 쓸 수 없습니다.');
    if (!list.length) throw bad(`"${label}" 의 보기를 한 줄에 하나씩 넣어 주세요.`);
    options = [...new Set(list)].slice(0, 50);
  }
  const custom = !BUILTIN_FIELDS.some((b) => b.key === f.key);
  return { key: f.key, label, mode, type, sort, ...(custom ? { custom: true } : {}), ...(options ? { options } : {}) };
}

function csvResponse(data, withdrawn) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fmt = (ms) => (ms ? new Date(ms + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '');
  let head; let lines;
  if (withdrawn) {
    head = ['이름', '아이디', '탈퇴일', '탈퇴사유'];
    lines = data.rows.map((r) => [r.name, r.login_id, fmt(r.withdrawn_at), r.withdraw_reason]);
  } else {
    const extra = data.fields.filter((f) => !['name'].includes(f.key));
    head = ['이름', '아이디', ...extra.map((f) => f.label), '등급', '가입일', '최근 로그인', '상태'];
    lines = data.rows.map((r) => [r.name, r.login_id,
      ...extra.map((f) => { const v = MEMBER_COLUMNS.includes(f.key) ? r[f.key] : r.extra[f.key]; return Array.isArray(v) ? v.join(', ') : v; }),
      data.levelNames[r.level], fmt(r.created_at), fmt(r.last_login_at), r.status === 'LOCKED' ? '잠김' : '']);
  }
  const csv = `﻿${[head, ...lines].map((l) => l.map(cell).join(',')).join('\r\n')}`;
  const name = `${withdrawn ? 'withdrawn' : 'members'}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
}

// ───────── 게시판 도우미 ─────────
export function boardOut(b) {
  const o = JSON.parse(b.options || '{}');
  return {
    id: b.id, slug: b.slug, name: b.name, list_layout: b.list_layout, visible: !!b.visible, deleted_at: b.deleted_at, sort: b.sort,
    list_levels: levelsOf(b.list_levels), read_levels: levelsOf(b.read_levels), write_levels: levelsOf(b.write_levels), comment_levels: levelsOf(b.comment_levels),
    allow_guest_list: !!b.allow_guest_list, allow_guest_read: !!b.allow_guest_read, allow_guest_write: !!b.allow_guest_write, guest_menu: !!b.guest_menu,
    use_comment: !!b.use_comment, use_secret: !!b.use_secret, options: boardOptions(o),
  };
}
export function boardOptions(o = {}) {
  return {
    list_show: { no: o.list_show?.no !== false, writer: o.list_show?.writer !== false, date: o.list_show?.date !== false, views: o.list_show?.views !== false },
    view_show: { writer: o.view_show?.writer !== false, date: o.view_show?.date !== false, views: o.view_show?.views !== false },
    writer_mode: o.writer_mode === 'HIDDEN' ? 'HIDDEN' : 'NAME',
    page_size: [10, 20, 30].includes(Number(o.page_size)) ? Number(o.page_size) : 20,
    new_hours: 72,
  };
}
async function boardFields(db, site, raw, cur) {
  const name = str(raw.name, 40);
  if (!name) throw bad('게시판 이름을 넣어 주세요.');
  const slug = str(raw.slug, 40).toLowerCase();
  if (!SLUG_RE.test(slug)) throw bad('주소는 영문 소문자·숫자·하이픈(-)으로 넣어 주세요.');
  if (RESERVED.has(slug)) throw bad('그 주소는 쓸 수 없습니다.');
  const dup = await db.prepare('SELECT id FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL AND id != ?').bind(site, slug, cur?.id || 0).first();
  if (dup) throw bad('이미 다른 게시판이 쓰는 주소입니다.');
  const lv = (k, d) => (raw[k] === undefined ? d : maskFrom(raw[k]));
  const yes = (k, d) => (raw[k] === undefined ? d : (raw[k] ? 1 : 0));
  return {
    name, slug,
    list_layout: LAYOUTS.includes(raw.list_layout) ? raw.list_layout : 'TABLE',
    list_levels: lv('list_levels', ALL_LEVELS), read_levels: lv('read_levels', ALL_LEVELS),
    write_levels: lv('write_levels', 1), comment_levels: lv('comment_levels', ALL_LEVELS),
    allow_guest_list: yes('allow_guest_list', 1), allow_guest_read: yes('allow_guest_read', 1), allow_guest_write: yes('allow_guest_write', 0),
    guest_menu: yes('guest_menu', 1), use_comment: yes('use_comment', 1), use_secret: yes('use_secret', 0),
    options: JSON.stringify(boardOptions(raw.options || {})),
  };
}

// ───────── 메뉴 도우미 ─────────
async function menuFields(db, site, raw, cur) {
  const title = str(raw.title, 40);
  if (!title) throw bad('메뉴 이름을 넣어 주세요.');
  const type = ['PAGE', 'BOARD', 'LINK'].includes(raw.menu_type) ? raw.menu_type : 'PAGE';
  let path = ''; let boardId = null;
  if (type === 'PAGE') {
    path = str(raw.path, 200);
    if (path && !/^\/[A-Za-z0-9\-._~/%#?=&]*$/.test(path)) throw bad('사이트 안 주소는 / 로 시작하게 넣어 주세요. 예) /about.html');
  } else if (type === 'LINK') {
    path = str(raw.path, 500);
    if (!/^https?:\/\/\S+$/i.test(path)) throw bad('외부 주소는 https:// 로 시작하게 넣어 주세요.');
  } else {
    boardId = Number(raw.board_id);
    const b = await db.prepare('SELECT id FROM boards WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(boardId, site).first();
    if (!b) throw bad('게시판을 골라 주세요.');
  }
  let parent = raw.parent_id ? Number(raw.parent_id) : null;
  if (parent) {
    const p = await db.prepare('SELECT id, menu_type, parent_id FROM menus WHERE id = ? AND site = ?').bind(parent, site).first();
    if (!p) throw bad('상위 메뉴가 없습니다.');
    if (p.menu_type === 'LINK') throw bad('외부 링크 아래에는 메뉴를 넣을 수 없습니다.');
    if (cur) { // 자기 자신이나 자기 아래로는 못 옮긴다
      let c = p; let guard = 0;
      while (c && guard++ < 30) { if (c.id === cur.id) throw bad('자기 아래 메뉴를 상위 메뉴로 고를 수 없습니다.'); c = c.parent_id ? await db.prepare('SELECT id, parent_id FROM menus WHERE id = ?').bind(c.parent_id).first() : null; }
    }
  }
  if (type === 'LINK' && cur) {
    const kids = await db.prepare('SELECT COUNT(*) AS n FROM menus WHERE parent_id = ?').bind(cur.id).first();
    if (kids.n) throw bad('하위 메뉴가 있는 메뉴는 외부 링크로 바꿀 수 없습니다.');
  }
  const levels = Array.isArray(raw.read_levels) ? maskFrom(raw.read_levels) : null;
  return {
    title, menu_type: type, path, board_id: boardId, parent_id: parent,
    read_levels: type === 'BOARD' ? null : (levels || null),
    allow_guest_read: type === 'BOARD' ? 1 : (raw.allow_guest_read === false ? 0 : 1),
  };
}
async function insertMenu(db, site, n) {
  const max = await db.prepare('SELECT MAX(sort) AS s FROM menus WHERE site = ? AND parent_id IS ?').bind(site, n.parent_id).first();
  const r = await db.prepare('INSERT INTO menus (site, parent_id, title, menu_type, path, board_id, sort, visible, read_levels, allow_guest_read) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .bind(site, n.parent_id, n.title, n.menu_type, n.path, n.board_id, (max?.s || 0) + 1, n.read_levels, n.allow_guest_read).run();
  return r.meta.last_row_id;
}


// 수정 요청에 붙인 파일: 이 사이트에 올라간 것만, 보낸 차례대로 [{ id, name, size, kind, mime }]
async function requestAtts(db, site, list) {
  const ids = (Array.isArray(list) ? list : []).map(String).filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 30);
  if (!ids.length) return [];
  const { results: ups } = await db.prepare(`SELECT id, name, size, kind, mime FROM uploads WHERE site = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(site, ...ids).all();
  return ids.map((id) => ups.find((u) => u.id === id)).filter(Boolean);
}

async function ximSite(env, site) {
  const s = await env.XIM_DB.prepare('SELECT id FROM sites WHERE slug = ?').bind(site).first();
  if (!s) throw notFound('xim 에 등록되지 않은 사이트입니다.');
  return s;
}

// 수정 모드 페이지 주소: /about.html · /about · /about/ 을 같은 것으로 (사이트 Worker pagePath 와 같게)
function pageKey(p) {
  let s = String(p || '/').split(/[?#]/)[0].slice(0, 300);
  try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
  s = s.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1');
  return s || '/';
}
