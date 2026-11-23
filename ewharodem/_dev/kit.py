"""이화아동발달연구소 사이트 생성 도구 — 공통 자료(연락처 · 메뉴)와 틀(머리 · 꼬리 · 하위 페이지 머리), 본문 조각.
   html 은 손으로 고치지 않는다:  python ewharodem/_dev/build.py  가 모든 쪽을 다시 찍는다.
   글을 고쳤으면 build.py 뒤에 build-fonts.py 도 돌리고 FV 를 올린다(글꼴에 쓰는 글자만 담기 때문)."""
import html as _h
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
V = "20261124g"          # css · js · 그림 주소 버전 — 파일을 바꾸면 올린다
FV = "4"                 # 글꼴 버전(style.css 의 @font-face 주소도 같이)
NOINDEX = True           # 연구소가 내용을 확인하기 전까지 검색에 나오지 않게. 확인되면 False
SITE = "이화아동발달연구소"
TEL = "02-949-0842"
ADDR = "서울 노원구 한글비석로 444 교림노원프라자 3층 303호"
ADDR_OLD = "상계동 450"
CALL_HOURS = "월 ~ 금 12:30 ~ 18:00"            # 전화 문의(블로그 2024 글)
OPEN_HOURS = "월 ~ 금 12:00 ~ 20:00 · 토 · 일 쉼"   # 네이버 플레이스
BLOG = "https://blog.naver.com/ewharodem"
NMAP = "https://map.naver.com/p/entry/place/35567964"
PRICE_DATE = "2026년 11월 안내 기준"

e = lambda s: _h.escape(str(s), quote=True)
href = lambda f: "./" if f == "index" else f"{f}.html"

# ── 메뉴(1단 → 2단: 파일, 이름, 한 줄)
MENU = [
    dict(key="guide", title="처음 오셨나요", items=[("guide", "처음 오셨나요", "상담 예약부터 수업까지")]),
    dict(key="program", title="프로그램", items=[
        ("speech", "말 · 언어", "언어치료 — 또래보다 말이 늦을 때"),
        ("aac", "그림으로 말하기", "PECS · AAC — 말로 표현하기 어려울 때"),
        ("learning", "읽기 · 학습", "인지치료 — 읽기 · 수학이 힘들 때"),
        ("aba", "행동 · 조기교실", "ABA — 일찍 시작하는 발달 교육"),
        ("arts", "음악 · 미술", "소리와 그림으로 넓히는 표현"),
        ("group", "그룹 활동", "사회성 · 학교 준비 · 방학 특별활동")]),
    dict(key="voucher", title="바우처 · 비용", items=[("voucher", "바우처 · 비용", "발달재활서비스 · 치료지원(굳센카드)")]),
    dict(key="about", title="연구소", items=[
        ("about", "소개 · 걸어온 길", "2003년부터의 기록"),
        ("team", "함께하는 사람들", "원장 · 부원장과 치료진"),
        ("space", "공간 둘러보기", "치료실 · 대기실"),
        ("location", "오시는 길", "상계역 9분 · 주차")]),
]
GROUP_OF = {f: m for m in MENU for f, _, _ in m["items"]}
TITLE_OF = {f: t for m in MENU for f, t, _ in m["items"]}

# ── 선 그림 아이콘
def svg(d, cls="", vb="0 0 24 24", sw="1.9"):
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="{vb}" fill="none" stroke="currentColor" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'
I = dict(
    arrow=svg('<path d="M5 12h14M13 6l6 6-6 6"/>', "i-arrow"),
    phone=svg('<path d="M6.6 3.5h3l1.5 4-2 1.3a12 12 0 0 0 6.1 6.1l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>', "i-phone"),
    pin=svg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/>', "i-pin"),
    check=svg('<path d="M5 12.5l4.5 4.5L19 7.500"/>', "i-check", sw="2.4"),
    plus=svg('<path d="M12 5v14M5 12h14"/>', "i-plus", sw="2.2"),
    clock=svg('<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>', "i-clock"),
    out=svg('<path d="M9 5h10v10M19 5L6 18"/>', "i-out"),
)
# 로고의 꽃(다섯 장 꽃잎) — 번호 · 목록 표식에 쓴다
PETAL = '<svg class="petal" viewBox="0 0 40 40" aria-hidden="true"><g fill="currentColor"><circle cx="20.0" cy="10.8" r="8.300"/><circle cx="28.7" cy="17.2" r="8.300"/><circle cx="25.4" cy="27.4" r="8.300"/><circle cx="14.6" cy="27.4" r="8.300"/><circle cx="11.3" cy="17.2" r="8.300"/><circle cx="20" cy="20" r="8"/></g></svg>'

_SIZE = {}
def size(name):
    if name not in _SIZE:
        with Image.open(ROOT / "images" / name) as im: _SIZE[name] = im.size
    return _SIZE[name]
def img(name, alt="", cls="", lazy=True, sizes=None, small=True):
    """images/<name>.webp (+ <name>-s.webp 가 있으면 srcset). 크기를 읽어 width/height 를 넣는다."""
    f = name if "." in name else name + ".webp"; w, h = size(f)
    s = f.replace(".webp", "-s.webp")
    srcset = f' srcset="images/{s}?v={V} 800w, images/{f}?v={V} {w}w" sizes="{sizes or "(max-width: 760px) 100vw, 50vw"}"' if small and (ROOT / "images" / s).exists() else ""
    return f'<img src="images/{f}?v={V}"{srcset} alt="{e(alt)}" width="{w}" height="{h}"{f" class=\"{cls}\"" if cls else ""}{" loading=\"lazy\" decoding=\"async\"" if lazy else " fetchpriority=\"high\""}>'

# ── 본문 조각
def tag(t, cls=""): return f'<span class="tag{" " + cls if cls else ""}">{t}</span>'
def btn(label, to, cls="", icon="arrow", attrs=""): return f'<a class="btn{" " + cls if cls else ""}" href="{to}"{attrs}><span>{label}</span>{I[icon] if icon else ""}</a>'
def tel_btn(cls="", label=None): return f'<a class="btn tel{" " + cls if cls else ""}" href="tel:{TEL}">{I["phone"]}<span>{label or "전화 상담 " + TEL}</span></a>'
def head(kicker, title, lead="", more=None, cls=""):
    """구간 머리: 작은 딱지 + 제목(<em> = 손그림 밑줄 낱말) + 설명, 오른쪽 '더 보기'"""
    m = f'<a class="more" href="{more[1]}"><span>{more[0]}</span>{I["arrow"]}</a>' if more else ""
    return f'<div class="sec-head{" " + cls if cls else ""}"><div>{tag(kicker) if kicker else ""}<h2>{title}</h2>{f"<p class=\"lead\">{lead}</p>" if lead else ""}</div>{m}</div>'
def sec(inner, cls="", id=""): return f'<section class="sec{" " + cls if cls else ""}"{f" id=\"{id}\"" if id else ""}><div class="wrap">{inner}</div></section>\n'
def checks(items, cls=""): return f'<ul class="checks{" " + cls if cls else ""}">' + "".join(f"<li>{I['check']}<span>{x}</span></li>" for x in items) + "</ul>"
def dots(items, cls=""): return f'<ul class="dots{" " + cls if cls else ""}">' + "".join(f"<li>{x}</li>" for x in items) + "</ul>"
def steps(items, cls=""):
    """번호 줄: [(제목, 설명)]"""
    return f'<ol class="steps{" " + cls if cls else ""}">' + "".join(f'<li class="rv"><b class="no">{i:02d}</b><h3>{t}</h3><p>{d}</p></li>' for i, (t, d) in enumerate(items, 1)) + "</ol>"
def cards(items, cls=""):
    """글 카드: [(제목, 설명 html)] — 번호가 붙는 줄 모양"""
    return f'<div class="cards{" " + cls if cls else ""}">' + "".join(f'<article class="card rv"><b class="no">{i:02d}</b><h3>{t}</h3><div>{d}</div></article>' for i, (t, d) in enumerate(items, 1)) + "</div>"
def kv(rows, cls=""):
    """'항목 : 값' 줄"""
    return f'<dl class="kv{" " + cls if cls else ""}">' + "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in rows) + "</dl>"
def table(heads, rows, cls="", cap=""):
    th = "".join(f"<th scope=\"col\">{h}</th>" for h in heads)
    tr = "".join("<tr>" + "".join((f'<th scope="row">{c}</th>' if i == 0 else f'<td data-th="{e(heads[i])}">{c}</td>') for i, c in enumerate(r)) + "</tr>" for r in rows)
    return f'<div class="tbl{" " + cls if cls else ""}"><table>{f"<caption>{cap}</caption>" if cap else ""}<thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'
def faq(items):
    return '<div class="faq">' + "".join(f'<details class="qa"><summary><span>{q}</span>{I["plus"]}</summary><div class="qa-body"><div>{a}</div></div></details>' for q, a in items) + "</div>"
def figure(name, alt, cap="", cls="", sizes=None):
    return f'<figure class="fig{" " + cls if cls else ""}">{img(name, alt, sizes=sizes)}{f"<figcaption>{cap}</figcaption>" if cap else ""}</figure>'
def note(t, cls=""): return f'<p class="note{" " + cls if cls else ""}">{t}</p>'
def call_band(title="걱정되는 점을 전화로 먼저 들려주세요", sub="예약 후 방문 상담으로 이어집니다. 통화가 어려운 시간이면 전화 가능한 시간을 확인해 주세요."):
    """페이지 끝 상담 권유 판"""
    return sec(f'''<div class="callband rv"><div><h2>{title}</h2><p>{sub}</p></div>
<div class="callband-act"><a class="bigtel" href="tel:{TEL}">{I["phone"]}<b>{TEL}</b></a><p class="tel-state" data-tel-state>전화 문의 {CALL_HOURS}</p>{btn("오시는 길", href("location"), "line light")}</div></div>''', "sec-call")

# ── 머리 · 꼬리
def header(cur):
    g = GROUP_OF.get(cur, {}).get("key", "")
    nav = ""
    for m in MENU:
        first = m["items"][0][0]; on = ' class="on"' if m["key"] == g else ""
        if len(m["items"]) == 1: nav += f'<li><a href="{href(first)}"{on}>{m["title"]}</a></li>'
        else:
            sub = "".join(f'<li><a href="{href(f)}"{" aria-current=\"page\"" if f == cur else ""}><b>{t}</b><small>{d}</small></a></li>' for f, t, d in m["items"])
            nav += f'<li class="has-sub"><a href="{href(first)}"{on}>{m["title"]}</a><div class="sub"><ul>{sub}</ul></div></li>'
    drawer = ""
    for m in MENU:
        if len(m["items"]) == 1: drawer += f'<a class="dr-one" href="{href(m["items"][0][0])}">{m["title"]}</a>'
        else: drawer += f'<div class="dr-grp"><p>{m["title"]}</p>' + "".join(f'<a href="{href(f)}"{" aria-current=\"page\"" if f == cur else ""}>{t}</a>' for f, t, d in m["items"]) + "</div>"
    return f'''<a class="skip" href="#main">본문으로 건너뛰기</a>
<header class="hd" id="hd">
  <div class="wrap hd-in">
    <a class="logo" href="./" aria-label="{SITE} 처음으로"><img src="images/logo.png?v={V}" alt="{SITE}" width="544" height="141"></a>
    <nav class="gnb" aria-label="주 메뉴"><ul>{nav}</ul></nav>
    <div class="hd-side">
      <a class="btn tel hd-tel" href="tel:{TEL}">{I["phone"]}<span>{TEL}</span></a>
      <span class="hd-account" data-xms-account></span>
      <button class="burger" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="drawer"><i></i><i></i><i></i></button>
    </div>
  </div>
</header>
<div class="drawer" id="drawer" hidden>
  <div class="drawer-in">{drawer}
    <div class="dr-call"><a class="btn tel" href="tel:{TEL}">{I["phone"]}<span>전화 상담 {TEL}</span></a><p data-tel-state>전화 문의 {CALL_HOURS}</p></div>
  </div>
</div>
'''
def footer():
    cols = "".join(f'<div><p>{m["title"]}</p>' + "".join(f'<a href="{href(f)}">{t}</a>' for f, t, d in m["items"]) + "</div>" for m in MENU if len(m["items"]) > 1)
    one = "".join(f'<a href="{href(m["items"][0][0])}">{m["title"]}</a>' for m in MENU if len(m["items"]) == 1)
    return f'''<footer class="ft">
  <div class="wrap">
    <div class="ft-top">
      <div class="ft-brand">
        <img src="images/logo.png?v={V}" alt="{SITE}" width="544" height="141" loading="lazy">
        <p>아동 · 청소년 특수교육 전문기관<br>언어 · 인지 · 음악 · 미술치료</p>
        <a class="ft-tel" href="tel:{TEL}">{I["phone"]}<b>{TEL}</b></a>
        <p class="ft-hours">전화 문의 {CALL_HOURS}</p>
      </div>
      <nav class="ft-nav" aria-label="꼬리 메뉴">{cols}<div><p>안내</p>{one}<a href="{BLOG}" target="_blank" rel="noopener">블로그</a></div></nav>
    </div>
    <div class="ft-bot">
      <address>{ADDR} (계상초등학교 맞은편)</address>
      <p>이 홈페이지의 발달 정보는 일반적인 안내이며 진단을 대신하지 않습니다. 진단은 의료기관에서 받으시기 바랍니다.</p>
      <p class="ft-copy">© {SITE}</p>
    </div>
  </div>
</footer>
<div class="dock" aria-label="빠른 연결"><a href="tel:{TEL}">{I["phone"]}<span>전화 상담</span></a><a href="{href("location")}">{I["pin"]}<span>오시는 길</span></a></div>
'''
def doc(file, title, desc, body, body_cls="", noindex=False, preload=""):
    ttl = SITE if file == "index" else f"{title} | {SITE}"
    robots = '<meta name="robots" content="noindex, nofollow">\n' if (noindex or NOINDEX) else ""
    return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(ttl)}</title>
<meta name="description" content="{e(desc)}">
{robots}<meta property="og:type" content="website">
<meta property="og:title" content="{e(ttl)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="images/og.jpg?v={V}">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="images/favicon.png?v={V}">
<link rel="preload" as="font" type="font/woff2" href="fonts/ew-pretendard.woff2?v={FV}" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="fonts/ew-head.woff2?v={FV}" crossorigin>
{preload}<link rel="stylesheet" href="css/style.css?v={V}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" media="print" onload="this.media='all'">
</head>
<body class="{body_cls}">
{header(file)}{body}{footer()}<script src="js/site.js?v={V}" defer></script>
</body>
</html>
'''
def subpage(file, title, lead, body, kicker=None, desc=None, shape="a"):
    """하위 쪽: 머리 판(빵부스러기 · 묶음 이름 · 제목 · 한 줄) + 형제 탭 + main"""
    g = GROUP_OF[file]
    sib = ""
    if len(g["items"]) > 1:
        sib = '<nav class="tabs" aria-label="' + g["title"] + ' 메뉴"><div class="wrap"><ul>' + "".join(f'<li><a href="{href(f)}"{" class=\"on\" aria-current=\"page\"" if f == file else ""}>{t}</a></li>' for f, t, d in g["items"]) + "</ul></div></nav>"
    crumb = f'<p class="crumb"><a href="./">홈</a><i></i>{g["title"]}' + (f"<i></i>{TITLE_OF[file]}" if len(g["items"]) > 1 else "") + "</p>"
    top = f'''<div class="ph"><div class="wrap"><div class="ph-card shape-{shape}">{crumb}{tag(kicker or g["title"])}<h1>{title}</h1><p>{lead}</p><div class="ph-deco" aria-hidden="true">{PETAL}{PETAL}</div></div></div></div>
{sib}'''
    return doc(file, TITLE_OF[file], desc or lead, f'{top}<main id="main">\n{body}</main>\n', body_cls="inner")
def write(file, html):
    (ROOT / f"{file}.html").write_text(html, encoding="utf-8", newline="\n"); print("찍음", f"{file}.html", len(html) // 1024, "KB")
