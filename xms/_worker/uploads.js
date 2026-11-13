// 올린 파일 — 글 첨부(이미지 · 파일), 본문 안 그림 · PDF
//   저장: env.FILES(R2) 바인딩이 있으면 R2, 없으면 D1 uploads.data(base64, 한 파일 1.4MB 까지)
//   주소: /xms/upload/<id>  (내려받기는 ?dl=1). id 는 추측할 수 없는 임의 값.
//   용량: 사이트 전체 크기를 xim sites.used_mb 에 적고, quota_mb 를 넘으면 받지 않는다.
//   주인: post_id > 0 = 그 글, post_id < 0 = 수정 요청(-요청번호), NULL = 아직 저장 안 한 글쓰기 중.
//         프로필 사진 = AVATAR_BASE − 회원번호 (아주 작은 음수 — 수정 요청 번호와 겹치지 않고, 하루 지난 파일 정리에도 안 걸린다)
//   지우기(저장 공간 아끼기, 사용자 지시 2026-11-03): 글에서 빼거나 글을 지우면 파일(R2)도 지운다. 저장 안 하고 하루 지난 것도 지운다.
import { now, bad, forbidden, notFound, json, randomHex, HttpError, canBy, whoAmI } from './lib.js';
import { applyOn, canSeeApplyFile } from './apply.js';

const D1_MAX = 1400000;
export const AVATAR_BASE = -2000000000;
const AVATAR_MAX = 400000; // 프로필 사진은 화면에서 512px WEBP 로 줄여 올린다
const R2_MAX = 20 * 1024 * 1024;
const KINDS = ['IMAGE', 'FILE', 'INLINE', 'APPLY']; // APPLY = 신청서 서류 (apply.js — 낸 사람 · 관리자만 열어 봄)
const APPLY_MAX = 10 * 1024 * 1024;
const SAFE_INLINE = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/;

async function usage(env, site) {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE site = ?').bind(site).first();
  return r.n;
}

// POST /xms-api/uploads?board=<slug>&kind=IMAGE|FILE|INLINE  (본문 = 파일 그대로, 헤더 X-File-Name)
export async function uploadApi(ctx) {
  const { request, env, site, me, url } = ctx;
  const forAvatar = url.searchParams.get('for') === 'avatar';
  if (forAvatar) {
    // 프로필 사진 — 로그인한 회원 본인만
    if (me.kind !== 'member') throw new HttpError(401, '로그인한 뒤 프로필 사진을 올릴 수 있습니다.');
  } else if (url.searchParams.get('for') === 'apply') {
    // 신청서 서류 — 회원이면 등급 상관없이 (신청은 회원가입만 하면 된다)
    if (me.kind !== 'member') throw new HttpError(401, '로그인한 뒤 서류를 올릴 수 있습니다.');
    if (!(await applyOn(env.DB, site))) throw notFound('이 사이트는 신청서를 받지 않습니다.');
  } else if (url.searchParams.get('for') === 'request') {
    // 관리 화면 수정 요청에 붙이는 파일 — 관리자(레벨1) · 운영자만. 그 사이트 몫으로 저장돼 용량에 들어간다.
    if (me.level !== 1) throw forbidden('관리자만 올릴 수 있습니다.');
  } else {
    const board = await env.DB.prepare('SELECT * FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL').bind(site, url.searchParams.get('board') || '').first();
    if (!board || (!board.visible && me.level !== 1)) throw notFound('없는 게시판입니다.');
    if (!canBy(board.write_levels, board.allow_guest_write, me, true)) throw forbidden('이 게시판에 글을 쓸 수 없습니다.');
  }
  if (me.kind === 'guest') throw new HttpError(401, '사진과 파일은 로그인한 뒤 올릴 수 있습니다.');
  const forApply = url.searchParams.get('for') === 'apply';
  const kind = forApply ? 'APPLY' : KINDS.includes(url.searchParams.get('kind')) && url.searchParams.get('kind') !== 'APPLY' ? url.searchParams.get('kind') : 'FILE';
  const mime = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  let name = '';
  try { name = decodeURIComponent(request.headers.get('X-File-Name') || ''); } catch { name = ''; }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file';
  if (kind !== 'FILE' && !SAFE_INLINE.test(mime)) throw bad('사진(PNG · JPG · GIF · WEBP) 이나 PDF 만 넣을 수 있습니다.');
  if (forAvatar && !/^image\/(png|jpeg|gif|webp)$/.test(mime)) throw bad('프로필 사진은 PNG · JPG · GIF · WEBP 만 올릴 수 있습니다.');
  const buf = await request.arrayBuffer();
  const max = forAvatar ? AVATAR_MAX : !env.FILES ? D1_MAX : forApply ? APPLY_MAX : R2_MAX;
  if (!buf.byteLength) throw bad('빈 파일입니다.');
  if (buf.byteLength > max) {
    throw bad(env.FILES ? `파일이 너무 큽니다 (${Math.round(max / 1048576)}MB 까지).` : `파일이 너무 큽니다. 지금은 ${(D1_MAX / 1e6).toFixed(1)}MB 까지 올릴 수 있습니다.`);
  }
  const site_ = await env.XIM_DB.prepare('SELECT quota_mb FROM sites WHERE slug = ?').bind(site).first();
  const used = await usage(env, site);
  if (site_?.quota_mb && used + buf.byteLength > site_.quota_mb * 1024 * 1024) throw bad('저장 공간이 가득 찼습니다. 운영자에게 늘려 달라고 요청하세요.');

  if (Math.random() < 0.2) await purgeOrphans(env, site).catch(() => {}); // 가끔 묵은 파일 정리
  const id = randomHex(16);
  let data = null; let r2Key = null;
  if (env.FILES) {
    r2Key = `${site}/${id}`;
    await env.FILES.put(r2Key, buf, { httpMetadata: { contentType: mime } });
  } else {
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    data = btoa(s);
  }
  await env.DB.prepare('INSERT INTO uploads (id, site, post_id, kind, name, mime, size, data, r2_key, created_by, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, site, kind, name, mime, buf.byteLength, data, r2Key, me.kind === 'member' ? me.member.id : null, now()).run();
  await env.XIM_DB.prepare('UPDATE sites SET used_mb = ? WHERE slug = ?').bind(Math.round(((used + buf.byteLength) / 1048576) * 10) / 10, site).run();
  if (forAvatar) return setAvatar(env, site, me.member, id);
  return json({ id, url: `/xms/upload/${id}`, name, size: buf.byteLength, mime, kind });
}

// 프로필 사진: 새 파일을 그 회원 몫으로 묶고(members.extra.avatar), 전에 쓰던 사진은 지운다. id 가 없으면 빼기.
export async function setAvatar(env, site, member, id) {
  const owner = AVATAR_BASE - member.id;
  const extra = JSON.parse(member.extra || '{}');
  if (id) {
    await env.DB.prepare('UPDATE uploads SET post_id = ? WHERE id = ? AND site = ?').bind(owner, id, site).run();
    extra.avatar = `/xms/upload/${id}`;
  } else delete extra.avatar;
  await env.DB.prepare('UPDATE members SET extra = ? WHERE id = ? AND site = ?').bind(JSON.stringify(extra), member.id, site).run();
  await removeUploads(env, site, `post_id = ?${id ? ' AND id != ?' : ''}`, id ? [owner, id] : [owner]);
  return json({ ok: true, avatar: extra.avatar || '' });
}
export const avatarOf = (member) => { try { return JSON.parse(member?.extra || '{}').avatar || ''; } catch { return ''; } };

// 글 · 요청 본문에서 올린 파일 번호 찾기 (/xms/upload/<id>)
export const uploadIdsIn = (...texts) => [...new Set(texts.join(' ').match(/\/xms\/upload\/([0-9a-f]{32})/g)?.map((x) => x.slice(-32)) || [])];

// 고른 파일 지우기: R2 · DB 둘 다, 사이트 사용량도 다시 적는다
export async function removeUploads(env, site, where, binds = []) {
  const { results } = await env.DB.prepare(`SELECT id, r2_key FROM uploads WHERE site = ? AND (${where})`).bind(site, ...binds).all();
  if (!results.length) return 0;
  const keys = results.map((u) => u.r2_key).filter(Boolean);
  for (let i = 0; i < keys.length; i += 500) if (env.FILES) await env.FILES.delete(keys.slice(i, i + 500));
  const ids = results.map((u) => u.id);
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    await env.DB.prepare(`DELETE FROM uploads WHERE site = ? AND id IN (${part.map(() => '?').join(',')})`).bind(site, ...part).run();
  }
  const used = await usage(env, site);
  await env.XIM_DB.prepare('UPDATE sites SET used_mb = ? WHERE slug = ?').bind(Math.round((used / 1048576) * 10) / 10, site).run();
  return results.length;
}

// 글 저장 뒤: 본문에 남은 그림 · 첨부만 그 글 것으로 두고, 빠진 것은 지운다
export async function syncPostFiles(env, site, postId, html, attIds, me) {
  await attachToPost(env, site, postId, attIds, me, true);
  const keep = [...new Set([...uploadIdsIn(html), ...(Array.isArray(attIds) ? attIds.map(String) : [])])].filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 300);
  const inline = uploadIdsIn(html);
  if (inline.length) {
    await env.DB.prepare(`UPDATE uploads SET post_id = ? WHERE site = ? AND kind = 'INLINE' AND (post_id IS NULL OR post_id = ?) AND id IN (${inline.map(() => '?').join(',')})`)
      .bind(postId, site, postId, ...inline).run();
  }
  await removeUploads(env, site, `post_id = ?${keep.length ? ` AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`, [postId, ...keep]);
}

// 글을 지우면 그 글 파일도
export const removePostFiles = (env, site, postIds) => (postIds.length
  ? removeUploads(env, site, `post_id IN (${postIds.map(() => '?').join(',')})`, postIds) : 0);

// 올리고 저장하지 않은 채 하루 지난 파일 (글쓰기를 그만둔 것)
export const purgeOrphans = (env, site) => removeUploads(env, site, 'post_id IS NULL AND created_at < ?', [now() - 86400000]);

// 수정 요청에 쓴 파일 = post_id -요청번호
export async function claimForRequest(env, site, requestId, ids) {
  const list = [...new Set(ids)].filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 100);
  if (!list.length) return;
  await env.DB.prepare(`UPDATE uploads SET post_id = ? WHERE site = ? AND post_id IS NULL AND id IN (${list.map(() => '?').join(',')})`).bind(-requestId, site, ...list).run();
}

// GET /xms/upload/<id>[?dl=1]
//   글에 붙은 파일은 그 글을 볼 수 있는 사람만: 사진은 목록을 볼 수 있으면(카드 · 썸네일), 그 밖의 파일은 글 읽기 권한.
//   비밀글은 쓴 사람 · 관리자만, 숨김 · 예약 글은 관리자만. 아무나 볼 수 없는 파일은 공용 캐시에 남기지 않는다.
export async function serveUpload(env, site, id, download, request) {
  const u = await env.DB.prepare('SELECT * FROM uploads WHERE id = ? AND site = ?').bind(id, site).first();
  if (!u) throw notFound();
  let cache = 'public, max-age=86400';
  if (u.kind === 'APPLY') {
    // 신청서 서류: 낸 사람 · 관리자만, 어디에도 캐시하지 않는다
    cache = 'private, no-store';
    if (!canSeeApplyFile(u, await whoAmI(env.DB, request, site))) {
      return new Response('볼 수 없는 파일입니다.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  } else if (u.post_id > 0) {
    const p = await env.DB.prepare(`SELECT p.writer_id, p.is_secret, p.is_hidden, p.published_at, p.deleted_at, b.visible, b.deleted_at AS b_deleted,
      b.list_levels, b.read_levels, b.allow_guest_list, b.allow_guest_read FROM posts p JOIN boards b ON b.id = p.board_id WHERE p.id = ? AND p.site = ?`).bind(u.post_id, site).first();
    if (p) {
      const image = u.kind === 'IMAGE' || (u.kind === 'INLINE' && /^image\//.test(u.mime));
      const open = !p.deleted_at && !p.b_deleted && p.visible && !p.is_hidden && p.published_at <= now();
      const may = (me) => (image ? canBy(p.list_levels, p.allow_guest_list, me) || canBy(p.read_levels, p.allow_guest_read, me) : canBy(p.read_levels, p.allow_guest_read, me));
      if (!(open && !p.is_secret && may({ kind: 'guest', level: 0 }))) {
        cache = 'private, max-age=3600';
        const me = await whoAmI(env.DB, request, site);
        const mine = me.kind === 'member' && p.writer_id === me.member.id;
        if (!(me.level === 1 || (open && (!p.is_secret || mine) && may(me)))) {
          return new Response('볼 수 없는 파일입니다.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
        }
      }
    }
  }
  let body;
  if (u.r2_key && env.FILES) {
    const o = await env.FILES.get(u.r2_key);
    if (!o) throw notFound();
    body = o.body;
  } else if (u.data) {
    body = Uint8Array.from(atob(u.data), (c) => c.charCodeAt(0));
  } else throw notFound();
  // 사진 · PDF 만 화면에서 바로 열고, 그 밖의 파일은 늘 내려받기로 (html 같은 파일이 사이트 주소에서 실행되지 않게)
  const inline = !download && SAFE_INLINE.test(u.mime);
  return new Response(body, {
    headers: {
      'Content-Type': inline ? u.mime : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(u.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': cache,
    },
  });
}

// 글 저장 때: 첨부 목록(id 차례대로)을 그 글에 붙이고, 빠진 것은 떼어 낸다
export async function attachToPost(env, site, postId, ids, me, keepOwner = false) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 50);
  const stmts = keepOwner ? [] : [env.DB.prepare("UPDATE uploads SET post_id = NULL WHERE site = ? AND post_id = ? AND kind != 'INLINE'").bind(site, postId)];
  list.forEach((id, i) => stmts.push(env.DB.prepare(`UPDATE uploads SET post_id = ?, sort = ? WHERE id = ? AND site = ? AND kind != 'INLINE'
    AND (post_id IS NULL OR post_id = ?) AND (created_by IS ? OR ? = 1)`).bind(postId, i, id, site, postId, me.kind === 'member' ? me.member.id : null, me.level === 1 ? 1 : 0)));
  if (stmts.length) await env.DB.batch(stmts); // 빈 batch 는 D1 이 오류를 낸다 (첨부 없이 새 글 등록 → "서버 오류" 인데 글은 들어감)
}

export async function postAttachments(env, site, postId) {
  const { results } = await env.DB.prepare("SELECT id, kind, name, mime, size FROM uploads WHERE site = ? AND post_id = ? AND kind != 'INLINE' ORDER BY sort, created_at")
    .bind(site, postId).all();
  return results.map((u) => ({ ...u, url: `/xms/upload/${u.id}` }));
}

// ───── 바로 올리기 (사용자 지시 2026-11-13 "1.8MB 올리는데 왜 이리 오래 걸려") ─────
//   국내 통신사는 사이트 주소(Cloudflare)를 미국 서부로 보내 올리기가 느리다(2MB 5~27초). R2 S3 주소는 서울(ICN)로 가서 0.2초 안쪽.
//   그래서 파일(FILE)은 브라우저가 미리 서명한 주소로 R2 에 바로 올리고, 다 올린 뒤 크기만 확인한다.
//   POST /xms-api/uploads/sign?board=<주소>&kind=FILE  { name, size, type }  → { id, put, ... }
//   POST /xms-api/uploads/<id>/done                      → 올린 파일 정보(uploadApi 와 같은 꼴)
//   비밀값 R2_KEY_ID · R2_SECRET (R2 API 토큰 'xms-upload', 버킷 xms-files 읽기 · 쓰기), 버킷 CORS 는 PUT 허용.
const R2_ACCOUNT = 'f225d506d8cf6ddf97704a36c69f5ce7';
const R2_BUCKET = 'xms-files';
const DIRECT_MAX = 200 * 1024 * 1024;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(key, s) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(s));
}
async function presignPut(env, key, seconds = 1800) {
  const host = `${R2_ACCOUNT}.r2.cloudflarestorage.com`;
  const path = `/${R2_BUCKET}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const day = t.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const q = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.R2_KEY_ID}/${scope}`, 'X-Amz-Date': t,
    'X-Amz-Expires': String(seconds), 'X-Amz-SignedHeaders': 'host',
  });
  const qs = [...q.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonical = ['PUT', path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', t, scope, await sha256(canonical)].join('\n');
  let k = await hmac(`AWS4${env.R2_SECRET}`, day);
  k = await hmac(k, 'auto'); k = await hmac(k, 's3'); k = await hmac(k, 'aws4_request');
  return `https://${host}${path}?${qs}&X-Amz-Signature=${hex(await hmac(k, toSign))}`;
}
export async function directUploadApi(ctx, id) {
  const { request, env, site, me, url } = ctx;
  if (!env.R2_KEY_ID || !env.R2_SECRET || !env.FILES) throw notFound('바로 올리기를 쓸 수 없습니다.');
  if (me.kind === 'guest') throw new HttpError(401, '파일은 로그인한 뒤 올릴 수 있습니다.');
  if (id) {   // 다 올렸다 — 실제 크기를 R2 에서 확인
    const u = await env.DB.prepare("SELECT * FROM uploads WHERE id = ? AND site = ? AND kind = 'FILE'").bind(id, site).first();
    if (!u || (me.kind === 'member' && u.created_by !== me.member.id && me.level !== 1)) throw notFound('없는 파일입니다.');
    const head = await env.FILES.head(u.r2_key);
    if (!head) throw bad('파일이 다 올라가지 않았습니다. 다시 올려 주세요.');
    await env.DB.prepare('UPDATE uploads SET size = ? WHERE id = ? AND site = ?').bind(head.size, id, site).run();
    const used = await usage(env, site);
    await env.XIM_DB.prepare('UPDATE sites SET used_mb = ? WHERE slug = ?').bind(Math.round((used / 1048576) * 10) / 10, site).run();
    return json({ id, url: `/xms/upload/${id}`, name: u.name, size: head.size, mime: u.mime, kind: 'FILE' });
  }
  // 서명 받기 — 권한은 uploadApi 와 같다(게시판 쓰기 권한 · 관리 화면 수정 요청은 관리자)
  if (url.searchParams.get('for') === 'request') { if (me.level !== 1) throw forbidden('관리자만 올릴 수 있습니다.'); }
  else {
    const board = await env.DB.prepare('SELECT * FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL').bind(site, url.searchParams.get('board') || '').first();
    if (!board || (!board.visible && me.level !== 1)) throw notFound('없는 게시판입니다.');
    if (!canBy(board.write_levels, board.allow_guest_write, me, true)) throw forbidden('이 게시판에 글을 쓸 수 없습니다.');
  }
  let raw = {}; try { raw = await request.json(); } catch { raw = {}; }
  const size = Math.max(0, Math.floor(Number(raw.size) || 0));
  if (!size) throw bad('빈 파일입니다.');
  if (size > DIRECT_MAX) throw bad(`파일이 너무 큽니다 (${DIRECT_MAX / 1048576}MB 까지).`);
  const name = String(raw.name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file';
  const mime = String(raw.type || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100) || 'application/octet-stream';
  const site_ = await env.XIM_DB.prepare('SELECT quota_mb FROM sites WHERE slug = ?').bind(site).first();
  const used = await usage(env, site);
  if (site_?.quota_mb && used + size > site_.quota_mb * 1024 * 1024) throw bad('저장 공간이 가득 찼습니다. 운영자에게 늘려 달라고 요청하세요.');
  if (Math.random() < 0.2) await purgeOrphans(env, site).catch(() => {});
  const nid = randomHex(16), key = `${site}/${nid}`;
  await env.DB.prepare('INSERT INTO uploads (id, site, post_id, kind, name, mime, size, data, r2_key, created_by, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?)')
    .bind(nid, site, 'FILE', name, mime, size, key, me.kind === 'member' ? me.member.id : null, now()).run();
  return json({ id: nid, put: await presignPut(env, key) });
}
