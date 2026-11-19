// 한 사이트의 사용량 (바이트) — xim 의 사이트별 사용량과 같은 계산
//   db    : 회원 · 글 · 댓글 · 메뉴 · 게시판 · 약관 · 팝업 · 관리 로그 등 글자 데이터 (줄마다 대략 크기를 더함)
//   files : 올린 사진 · 첨부(게시판 · 수정 요청) + 파비콘 · 미리보기 · 팝업 그림.  r2 / d1_files 는 어디에 있는지
const DB_QUERIES = [
  'SELECT SUM(length(login_id) + length(pw_hash) + length(pw_salt) + length(name) + length(nickname) + length(email) + length(mobile) + length(phone) + length(extra) + 120) AS n FROM members WHERE site = ?',
  'SELECT SUM(length(title) + length(content_html) + COALESCE(length(blocks), 0) + length(writer_name) + 100) AS n FROM posts WHERE site = ?',
  'SELECT SUM(length(body) + length(writer_name) + 60) AS n FROM comments WHERE site = ?',
  'SELECT SUM(length(content) + 40) AS n FROM documents WHERE site = ?',
  'SELECT SUM(length(title) + length(path) + 60) AS n FROM menus WHERE site = ?',
  'SELECT SUM(length(name) + length(slug) + length(options) + 120) AS n FROM boards WHERE site = ?',
  'SELECT SUM(length(actor_name) + length(target) + length(detail) + length(ip) + 60) AS n FROM audit_log WHERE site = ?',
  'SELECT SUM(length(title) + length(body) + length(link_url) + 80) AS n FROM popups WHERE site = ?',
  'SELECT SUM(length(level_names) + length(signup_fields)) AS n FROM site_settings WHERE site = ?',
  'SELECT SUM(length(title) + length(description) + length(verify) + length(robots) + length(share_description)) AS n FROM site_seo WHERE site = ?',
  'SELECT COUNT(*) * 40 AS n FROM visit_days WHERE site = ?',
  'SELECT SUM(length(path) + 30) AS n FROM visit_pages WHERE site = ?',
  'SELECT SUM(length(ref) + 30) AS n FROM visit_refs WHERE site = ?',
];

// 저장 공간 한도에 드는 크기(바이트) = 올린 파일(uploads) + 설정 그림(site_files: 파비콘 · 미리보기 · 팝업)
//   올리기 전 한도 확인 · 관리 화면 옆 메뉴 숫자 · xim 사이트 목록이 모두 이 계산을 쓴다(usageOf 의 files 와 같은 값). 가벼워서 기억해 두지 않는다
export async function filesUsed(env, site) {
  const [a, b] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM (SELECT MAX(size) AS size FROM uploads WHERE site = ? GROUP BY COALESCE(r2_key, id))').bind(site),   // 여러 글이 함께 쓰는 파일은 한 번만
    env.DB.prepare('SELECT COALESCE(SUM(length(data)), 0) * 3 / 4 AS n FROM site_files WHERE site = ?').bind(site),
  ]);
  return (a.results[0]?.n || 0) + (b.results[0]?.n || 0);
}

export async function usageOf(env, site) {
  const x = env.DB;
  const res = await x.batch([
    ...DB_QUERIES.map((q) => x.prepare(q).bind(site)),
    x.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS total, COALESCE(SUM(CASE WHEN r2_key IS NOT NULL THEN size ELSE 0 END), 0) AS r2,
      COALESCE(SUM(CASE WHEN kind = 'FILE' THEN size ELSE 0 END), 0) AS files_only
      FROM (SELECT MAX(size) AS size, MAX(r2_key) AS r2_key, MAX(kind) AS kind FROM uploads WHERE site = ? GROUP BY COALESCE(r2_key, id))`).bind(site),   // 여러 글이 함께 쓰는 파일은 한 번만
    x.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(length(data)), 0) * 3 / 4 AS total FROM site_files WHERE site = ?').bind(site),
  ]);
  const db = res.slice(0, DB_QUERIES.length).reduce((s, r) => s + (r.results[0]?.n || 0), 0);
  const up = res[DB_QUERIES.length].results[0];
  const sf = res[DB_QUERIES.length + 1].results[0];
  const s = await env.XIM_DB.prepare('SELECT quota_mb, static_mb FROM sites WHERE slug = ?').bind(site).first();
  return {
    db,
    files: up.total + sf.total,
    file_count: up.c + sf.c,
    r2: up.r2,
    d1_files: up.total - up.r2 + sf.total,
    images: up.total - up.files_only,   // 사진(본문 · 첨부 사진)
    attachments: up.files_only,          // 첨부 파일
    settings_files: sf.total,            // 파비콘 · 미리보기 · 팝업 그림
    static_mb: s?.static_mb || 0,
    quota_mb: s?.quota_mb || 0,
  };
}
