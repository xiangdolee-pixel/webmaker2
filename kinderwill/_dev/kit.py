"""킨더윌 사이트 생성 도구 — 공통 자료(지점 · 메뉴 · 링크)와 틀(머리 · 꼬리 · 하위 페이지 머리), 본문 조각 함수.
   페이지 파일은 손으로 고치지 않는다: python kinderwill/_dev/build.py 가 이 자료로 모든 html 을 다시 찍는다.
   2차 디자인(2026-11-22): 부품 함수의 이름 · 인자는 그대로, 내는 모양(css)만 바꿨다. 새 부품은 "새 부품" 구역 — 쓰임은 _pc/kinderwill/KIT2.md"""
import html as _h, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V = "20261122g"                      # css · js · 그림 주소 버전 — 파일을 바꾸면 올린다
FV = "3"                             # 글꼴 파일 버전 — build-fonts.py 를 다시 돌려 글자가 바뀌면 올린다(style.css 의 @font-face 주소도 같이)
SITE = "킨더윌 사회성언어전문센터"
KAKAO = "https://pf.kakao.com/_ZxoxfUb"
NBOOK = "https://booking.naver.com/booking/5/bizes/472902"
BLOG = "https://blog.naver.com/kinderwill"
INSTA = "https://www.instagram.com/kinderwill_center/"
NREVIEW = "https://m.place.naver.com/place/1634982404/review/visitor"
KIDSTEP_URL = "https://kidstep.co.kr"
HOURS = "평일 10:30 ~ 19:30 · 토요일 09:00 ~ 15:00 · 일요일 · 공휴일 휴무 (토요일 상담은 사전 예약)"

e = lambda s: _h.escape(str(s), quote=True)

# ── 지점
BRANCHES = [
    dict(key="c1", short="1센터", name="킨더윌 1센터", full="킨더윌 언어심리전문센터 1센터", addr="서울 노원구 한글비석로 474", addr2="보람상가 2층", tel="02-951-3421",
         does="언어치료 · 놀이치료 · 상담", rooms="언어치료실 · 놀이치료실 · 상담실 · 대기실"),
    dict(key="c2", short="2센터", name="킨더윌 2센터", full="킨더윌 사회성언어전문센터 2센터", addr="서울 노원구 상계로23다길 13-8", addr2="노원아이파크 1층", tel="02-930-3421",
         does="언어 · 놀이 · 미술 · 감각통합 · 인지 치료", rooms="언어치료실 · 놀이치료실 · 감각통합치료실 · 대기실"),
    dict(key="c3", short="3센터", name="킨더윌 3센터", full="킨더윌 사회성언어전문센터 3센터", addr="서울 노원구 상계로27길 32", addr2="대명빌딩 4층", tel="02-939-3421",
         does="사회성 그룹 프로그램 · 언어 · 심리 치료", rooms="사회성 교실 · 치료실 · 상담실 · 안내데스크 · 대기실"),
    dict(key="c4", short="4센터", name="킨더윌 4센터 · 러닝센터", full="킨더윌 4센터(러닝센터 · 전국민마음투자 상담)", addr="서울 노원구 한글비석로31길 34", addr2="2층", tel="",
         does="학습 프로그램(킨더윌 알파α) · 전국민마음투자 상담", rooms="학습 공간 · 상담 공간 · 대기실"),
    dict(key="ks", short="키즈스텝", name="키즈스텝 스마트성장센터", full="키즈스텝 스마트성장센터", addr="서울 노원구 상계로27길 32", addr2="대명빌딩 401호", tel="02-936-3421",
         does="성장 측정 · 맞춤 성장 프로그램", rooms="성장 측정 · 운동 공간"),
]
BR = {b["key"]: b for b in BRANCHES}

# ── 메뉴(1단 → 2단).  desc 는 큰 메뉴 왼쪽 소개, 2단의 둘째 값은 한 줄 설명
MENU = [
    dict(key="about", title="킨더윌 소개", desc="2016년 문을 연 뒤, 아이들의 말과 마음과 관계를 함께 돌봐 온 발달 전문 센터입니다.", items=[
        ("about", "인사말", "이름에 담은 뜻과 약속"), ("history", "걸어온 길", "연혁 · 언론보도 · 방송"), ("team", "전문가 소개", "분야별 치료사 · 상담사"),
        ("centers", "센터 안내 · <span class=\"nb\">오시는 길</span>", "1 ~ 4센터와 키즈스텝"), ("news", "블로그 소식", "수업 이야기와 발달 정보")]),
    dict(key="social", title="사회성 프로그램", desc="또래와 함께 배우는 킨더윌의 대표 그룹 프로그램. 화용언어를 중심으로 나이와 발달에 맞춰 반을 나눕니다.", items=[
        ("social", "사회성 프로그램 한눈에", "이런 아이에게 · 나이별 안내"), ("social-programs", "프로그램별 안내", "화용언어 · 놀이 · 감각통합 · 성장체육 · 학교준비")]),
    dict(key="kidstep", title="키즈스텝스마트성장센터", desc="측정하고, 분석하고, 관리하는 성장 — 키즈스텝 스마트성장센터.", items=[
        ("kidstep", "키즈스텝 스마트성장센터", "성장 시스템 · 프로그램 · 센터 안내")]),
    dict(key="therapy", title="치료 · 상담", desc="평가에서 시작해 아이에게 꼭 필요한 치료만 권합니다. 1:1 수업 40분과 보호자 상담 10분.", items=[
        ("speech", "언어치료", "말이 늦거나 발음 · 유창성이 걱정될 때"), ("play", "놀이치료", "마음과 관계의 어려움을 놀이로"), ("art", "미술치료", "말로 하기 어려운 감정을 그림으로"),
        ("sensory", "감각통합치료", "감각 · 자세 · 조절의 어려움"), ("cognitive", "인지치료", "이해 · 집중 · 학습의 기초"), ("counsel", "심리상담", "유아 · 아동부터 청소년 · 성인까지")]),
    dict(key="alpha", title="학습 프로그램", desc="러닝센터(4센터)의 킨더윌 알파α — 감각과 놀이로 언어 · 수 · 인지의 기초를 다집니다.", items=[
        ("alpha", "킨더윌 알파α", "오감언어 · 미술언어 · 말놀이언어 · 놀이수학 · 인지학습 · 사회성수업")]),
    dict(key="guide", title="이용 안내", desc="처음 전화부터 종결까지의 절차와 정부 바우처, 상담 문의 방법을 안내합니다.", items=[
        ("guide", "처음 오시는 분", "이용 절차 · 자주 묻는 질문"), ("voucher", "바우처 안내", "발달재활 · 지역사회서비스 · 교육청 · 마음투자"), ("contact", "상담 문의", "전화 · 카카오톡 · 네이버 예약 · 문의 남기기")]),
]
GROUP_OF = {f: m["key"] for m in MENU for f, _, _ in m["items"]}
TITLE_OF = {f: t for m in MENU for f, t, _ in m["items"]}
href = lambda f: "./" if f == "index" else f"{f}.html"

# ── 아이콘(선 그림)
def svg(d, cls=""):
    return f'<svg{f" class=\"{cls}\"" if cls else ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'
I = dict(
    arr='<path d="M5 12h14M13 6l6 6-6 6"/>', pin='<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/>',
    tel='<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', chat='<path d="M21 11.500a8.500 8.500 0 0 1-12.800 7.300L3 20l1.300-4.800A8.500 8.500 0 1 1 21 11.500z"/>',
    cal='<rect x="3.500" y="5" width="17" height="15.500" rx="2.500"/><path d="M8 3v4M16 3v4M3.500 10h17M8.500 15l2.300 2.300 4.700-4.800"/>', flag='<path d="M5 21V4M5 4.500h11l-2 4 2 4H5"/>',
    users='<circle cx="9" cy="8.500" r="3.200"/><path d="M3 20c0-3.300 2.700-5.500 6-5.500s6 2.200 6 5.500"/><path d="M16 5.600a3.200 3.200 0 0 1 0 5.800M17.500 14.800c2.100.600 3.500 2.400 3.500 5.200"/>',
    heart='<path d="M12 20s-7.500-4.600-7.500-10.200A4.300 4.300 0 0 1 12 7.400a4.300 4.300 0 0 1 7.500 2.400C19.500 15.400 12 20 12 20z"/>', card='<rect x="3" y="5.500" width="18" height="13" rx="2.500"/><path d="M3 10h18M7 15h4"/>',
    talk='<path d="M4 5.500h16v10H10l-4.500 3.500V15.500H4z"/><path d="M8.500 9.500h7M8.500 12.200h4.500"/>', puzzle='<path d="M9 4h4v2.200a1.800 1.800 0 1 0 3.400 0V4H20v5h-2a1.800 1.800 0 1 0 0 3.500h2V20h-5v-2a1.800 1.800 0 1 0-3.500 0v2H4v-5.500h2.200a1.800 1.800 0 1 0 0-3.500H4V4z"/>',
    brush='<path d="M14 4l6 6-8.500 8.500H7v-4.500z"/><path d="M4 20c2 0 3-.800 3-2.500"/>', swing='<path d="M4 3h16M8 3v10M16 3v10M6.500 13h11l-1 4h-9z"/>', bulb='<path d="M9 18h6M10 21h4M8.500 14.500A6 6 0 1 1 15.500 14.500c-.600.500-1 1.300-1 2.000h-5c0-.700-.400-1.500-1-2z"/>',
    chart='<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6M20 16V6"/>', ruler='<path d="M3.500 15.500l12-12 5 5-12 12z"/><path d="M7.500 11.500l2 2M10.500 8.500l2 2M13.500 5.500l2 2"/>',
    shield='<path d="M12 3l7 3v5.500c0 4.500-3 7.800-7 9.500-4-1.700-7-5-7-9.500V6z"/><path d="M9 12l2.200 2.200L15 10"/>', run='<circle cx="14.500" cy="4.800" r="1.800"/><path d="M6 20l3.500-5 2.500-2-1.500-4.500 4-1 2.500 3.500H20M11 13l3 2.500V20M10.500 8.500L7 10.500V13"/>',
    book='<path d="M4 5.500A2.500 2.500 0 0 1 6.500 3H20v15H6.500A2.500 2.500 0 0 0 4 20.500z"/><path d="M4 20.500A2.500 2.500 0 0 0 6.500 23H20v-5"/>', home='<path d="M4 11l8-7 8 7v9h-5.500v-5.500h-5V20H4z"/>',
    smile='<circle cx="12" cy="12" r="8.500"/><path d="M8.500 13.800a4 4 0 0 0 7 0M9 9.800h.010M15 9.800h.010"/>', check='<path d="M5 12.500l4.500 4.500L19 7.500"/>', play='<path d="M8 5.500v13l11-6.500z"/>',
    prev='<path d="M15 5l-7 7 7 7"/>', next='<path d="M9 5l7 7-7 7"/>', pause='<path d="M8.500 5.500v13M15.500 5.500v13"/>',
    ext='<path d="M14 4h6v6M20 4l-8.500 8.500M18 14v5.500H4.500V6H10"/>', menu='<path d="M4 7h16M4 12h16M4 17h16"/>', leaf='<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19c2-4 5-7 9-9"/>',
)
ic = lambda k, cls="": svg(I[k], cls)

# ── 그림: images/<이름>.webp + 크기(sizes.json — prep_img 가 적어 둔다)
try: SIZES = json.loads((ROOT / "_dev" / "sizes.json").read_text(encoding="utf-8"))
except Exception: SIZES = {}
def img(name, alt="", cls="", lazy=True, extra=""):
    f = name if "." in name else name + ".webp"; w, h = SIZES.get(f, (0, 0))
    wh = f' width="{w}" height="{h}"' if w else ""
    return f'<img src="images/{f}?v={V}"{wh} alt="{e(alt)}"{f" class=\"{cls}\"" if cls else ""}{" loading=\"lazy\" decoding=\"async\"" if lazy else ""}{extra}>'
# 간판 글자가 틀리게 나온 사진(2026-11-22 의뢰인 지적: c3desk "린더윌…", hero '전문' 빠짐, c1hall · h_env) — 다시 만들어 _pc/kinderwill/out/gpt/ 에 새 파일이 생기고
# prep_img.py 를 돌리면 저절로 풀린다. 그때까지 크게 쓰는 자리(하위 페이지 머리 · 히어로)는 다른 사진으로 바꿔 보여 준다.
import datetime as _dt
_GPT = ROOT.parent / "_pc" / "kinderwill" / "out" / "gpt"; _HOLD_T = _dt.datetime(2026, 11, 22, 9, 40).timestamp()
SIGN_HOLD = {"hero": "c3wait", "c3desk": "c3wait", "h_env": "c2sensory", "c1hall": "c1counsel"}
def held(name):
    """간판이 틀린 채로 아직 다시 만들어지지 않은 사진인가"""
    if name not in SIGN_HOLD: return False
    f = _GPT / f"{name}.png"
    return not (f.exists() and f.stat().st_mtime > _HOLD_T) if _GPT.exists() else False
def shot(name, alt="", cls="", lazy=True):
    return f'<figure class="shot{" " + cls if cls else ""}">{img(name, alt, lazy=lazy)}</figure>'

# ── 본문 조각 (이름 · 인자는 하위 페이지 모듈이 그대로 쓴다 — 바꾸지 않는다. 덧붙인 인자는 모두 기본값이 있다)
def sec(inner, soft=False, id="", cls="", tone=""):
    """구간. soft=True 연회색 / tone="peach" 옅은 복숭아 면(한 페이지에 한두 곳만) · "coral|teal|navy" 짙은 색 면(글자 · 단추 · 줄이 함께 반전)"""
    c = "sec" + (" sec-soft" if soft else "") + (f" sec-{tone}" if tone in ("peach", "coral", "teal", "navy") else "") + (" " + cls if cls else "")
    return f'<section class="{c}"{f" id=\"{id}\"" if id else ""}><div class="wrap">{inner}</div></section>\n'
def head(eb, h2, p="", center=False, teal=False, act="", kind="", n=""):
    """구간 머리. kind: "" 기본(넓은 화면: 제목 왼쪽 · 설명 오른쪽) / "stack" 세로로 쌓기 / "line" 제목 위에 긴 줄 + 작은 이름 / "big" 더 큰 제목.  n="01" 을 주면 큰 번호가 붙는다"""
    c = "sec-head rv" + (" center" if center else "") + (" split" if act else "") + (f" k-{kind}" if kind else "") + (" has-n" if n else "")
    num = f'<span class="sh-n" aria-hidden="true">{n}</span>' if n else ""
    return f'<div class="{c}">{num}{f"<span class=\"eb{" teal" if teal else ""}\">{eb}</span>" if eb else ""}<h2>{h2}</h2>{f"<p>{p}</p>" if p else ""}{f"<div class=\"sh-act\">{act}</div>" if act else ""}</div>'
def ticks(items): return '<ul class="ticks">' + "".join(f"<li>{x}</li>" for x in items) + "</ul>"
def needs(items, n3=False): return f'<ul class="needs{" n3" if n3 else ""} rv">' + "".join(f"<li><span>{x}</span></li>" for x in items) + "</ul>"
def pairs(items): return '<ul class="pairs rv">' + "".join(f"<li><span>{a}</span><i aria-hidden=\"true\"></i><b>{b}</b></li>" for a, b in items) + "</ul>"
def steps(items): return '<ol class="steps rv">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in items) + "</ol>"
def box(title, text="", small="", icon="", cls="", items=None, tag="h3"):
    return (f'<div class="box{" " + cls if cls else ""} rv">{f"<i class=\"ico\">{ic(icon)}</i>" if icon else ""}{f"<small>{small}</small>" if small else ""}<{tag}>{title}</{tag}>'
            f'{f"<p>{text}</p>" if text else ""}{ticks(items) if items else ""}</div>')
def grid(boxes, n=3): return f'<div class="grid{"" if n == 3 else f" g{n}"}">' + "".join(boxes) + "</div>"
def note(text, warn=False): return f'<p class="note{" warn" if warn else ""} rv"><span>{text}</span></p>'
def faq(q, a): return f'<details class="faq"><summary>{q}</summary><div>{a}</div></details>'
def table(heads, rows, right=()):
    th = "".join(f'<th{" class=\"r\"" if i in right else ""}>{h}</th>' for i, h in enumerate(heads))
    tr = "".join("<tr>" + "".join((f"<th>{c}</th>" if i == 0 else f'<td{" class=\"r\"" if i in right else ""}>{c}</td>') for i, c in enumerate(r)) + "</tr>" for r in rows)
    return f'<div class="tbl-w rv"><table class="tbl"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'
def dl(rows):
    def dd(v): return "<ul>" + "".join(f"<li>{x}</li>" for x in v) + "</ul>" if isinstance(v, (list, tuple)) else v
    return '<dl class="dl rv">' + "".join(f"<div><dt>{k}</dt><dd>{dd(v)}</dd></div>" for k, v in rows) + "</dl>"
def btn(text, to, cls="btn-brand", arrow=True, ext=False):
    return f'<a class="btn {cls}" href="{to}"{" target=\"_blank\" rel=\"noopener\"" if ext else ""}>{text}{ic("arr", "arr") if arrow else ""}</a>'
def tabs(name, items, color="coral"):
    """같은 페이지 안에서 내용만 바꾸는 알약 탭. items = [(키, 탭 글자, 내용 html)] — 배경이 미끄러진다(site.js)"""
    seg = f'<div class="seg {color}" data-tabs="{name}" role="tablist">' + "".join(f'<button type="button" role="tab" data-tab="{k}" aria-selected="{"true" if i == 0 else "false"}"{" class=\"on\"" if i == 0 else ""}>{t}</button>' for i, (k, t, _) in enumerate(items)) + "</div>"
    panes = "".join(f'<div class="pane{" on" if i == 0 else ""}" data-pane-of="{name}" data-pane="{k}" id="{name}-{k}">{h}</div>' for i, (k, _, h) in enumerate(items))
    return f'<div class="tabs-w">{seg}<div>{panes}</div></div>'
def video(yt, cap, start=0, poster=""):
    """유튜브 영상을 홈페이지 안에서 재생(누르면 그 자리에서 — 바깥으로 보내지 않는다)"""
    return f'<button type="button" class="vid rv" data-yt="{yt}"{f" data-start=\"{start}\"" if start else ""} aria-label="{e(cap)} 영상 재생">{img(poster, "") if poster else f'<img src="https://i.ytimg.com/vi/{yt}/hqdefault.jpg" alt="" loading="lazy" decoding="async">'}<span class="vid-play">{svg(I["play"])}</span><span class="vid-cap">{cap}</span></button>'
def more(text="자세히 보기"): return f'<span class="more">{text}{ic("arr")}</span>'

# ── 새 부품(2차 디자인) — 쓰임과 예는 _pc/kinderwill/KIT2.md
def figure(name, caption="", alt="", cls="", lazy=True):
    """사진 + 캡션. cls(띄어서 여러 개): tall(세로 4:5) · wide(16:9) · sq(1:1) · arch(한 모서리가 크게 둥근) · dot(모서리에 주황 원) · dot-teal(청록 원)"""
    return f'<figure class="fig{" " + cls if cls else ""} rv"><div class="fig-i">{img(name, alt or caption, lazy=lazy)}</div>{f"<figcaption>{caption}</figcaption>" if caption else ""}</figure>'
def duo(a, b, caption="", alt_a="", alt_b="", flip=False):
    """사진 두 장 겹치기: 큰 사진 a + 모서리에 걸친 작은 사진 b(뒤에 주황 원). flip=True 면 작은 사진이 왼쪽 아래"""
    return (f'<figure class="duo{" flip" if flip else ""} rv"><div class="duo-a">{img(a, alt_a or caption)}</div><div class="duo-b">{img(b, alt_b)}</div>'
            f'{f"<figcaption>{caption}</figcaption>" if caption else ""}</figure>')
def band(name, caption="", title="", text="", alt="", pos=""):
    """화면 폭을 꽉 채운 사진 띠 — sec() 와 sec() 사이에 둔다(sec 안에 넣지 않는다). title · text 를 주면 사진 왼쪽 아래에 얹는다. pos = 보일 자리(예: "50% 30%")"""
    tx = f'<div class="wrap band-tx rv">{f"<h2>{title}</h2>" if title else ""}{f"<p>{text}</p>" if text else ""}</div>' if title or text else ""
    return (f'<section class="band{" has-tx" if tx else ""}"><div class="band-i">{img(name, alt or caption, extra=f" style=\"object-position:{pos}\"" if pos else "")}</div>{tx}'
            f'{f"<p class=\"band-cap\"><span>{caption}</span></p>" if caption else ""}</section>\n')
def mosaic(items):
    """사진 모자이크: items = [(그림, 캡션)] 3 ~ 5장 — 첫 장이 크게, 나머지는 크기가 섞여 놓인다. 캡션은 마우스를 올리면 올라온다(폰은 늘 보임)"""
    return f'<div class="mosaic m{len(items)} rv">' + "".join(f'<figure>{img(n, c)}{f"<figcaption>{c}</figcaption>" if c else ""}</figure>' for n, c in items) + "</div>"
def quote(text, by="", role=""):
    """큰 인용문(둥근 제목 글꼴 + 큰 따옴표). by = 말한 사람, role = 직함"""
    return f'<blockquote class="bq rv"><p>{text}</p>{f"<footer><b>{by}</b>{f"<span>{role}</span>" if role else ""}</footer>" if by else ""}</blockquote>'
def rows(items, num=True, cols=1):
    """번호 줄 목록(카드 대신): items = [(제목, 설명)] 또는 [(제목, 설명, 주소)] — 주소가 있으면 줄 전체가 링크(화살표). num=False 번호 없음, cols=2 두 단"""
    def li(x):
        t, d = x[0], x[1]; to = x[2] if len(x) > 2 else ""
        inner = f'<b>{t}</b>{f"<span>{d}</span>" if d else ""}'
        return f'<li><a href="{to}">{inner}{ic("arr")}</a></li>' if to else f"<li><div>{inner}</div></li>"
    return f'<ol class="rows{"" if num else " plain"}{" c2" if cols == 2 else ""} rv">' + "".join(li(x) for x in items) + "</ol>"
def nums(items):
    """큰 숫자 줄: items = [(숫자, 단위, 설명)] — 예 ("2016", "년", "언어심리센터로 개원")"""
    return '<ul class="nums rv">' + "".join(f"<li><b>{a}<small>{u}</small></b><span>{t}</span></li>" for a, u, t in items) + "</ul>"
def split(left, right, wide=""):
    """왼쪽 제목 + 오른쪽 흐르는 내용. left 에는 보통 head(…, kind="stack"), right 에는 본문 조각. wide="l" 왼쪽 넓게 / "r" 오른쪽 넓게(기본)"""
    return f'<div class="split2{" wl" if wide == "l" else ""}"><div class="split2-l">{left}</div><div class="split2-r">{right}</div></div>'
def logos(items):
    """협력 기관 로고 줄: items = [(그림 파일, 이름)] — 예 ("ks/logo-inbody.webp", "인바디")"""
    return '<ul class="logos rv">' + "".join(f"<li>{img(f, n)}</li>" for f, n in items) + "</ul>"
def scene(name, text, by="", role="", alt="", pos="", dark=False, right=False):
    """쉬어 가는 장면: 화면 폭 사진 + 한 문장(구간 사이에 — sec() 밖에 둔다). 글은 사진의 빈 곳에 얹는다: 기본 왼쪽 · right=True 오른쪽,
       dark=True 는 어두운 사진용(흰 글자). by · role = 말한 사람(실제 인용일 때). pos = 사진에서 보일 자리. 문장은 현재 홈페이지에 있는 말에서 고른다"""
    who = f'<footer><b>{by}</b>{f"<span>{role}</span>" if role else ""}</footer>' if by else ""
    st = f' style="object-position:{pos}"' if pos else ""
    return (f'<section class="scene{" dark" if dark else ""}{" right" if right else ""}"><div class="scene-i">{img(name, alt, extra=st)}</div>'
            f'<div class="wrap"><blockquote class="scene-tx rv"><p>{text}</p>{who}</blockquote></div></section>\n')
def voices(items, more_to="", more_text="선생님 모두 보기"):
    """선생님 · 부모님의 한마디 줄: items = [(말, 이름, 직함, 얼굴 그림 또는 "")] 2 ~ 4개. 실제로 한 말만 쓴다(지어내지 않는다)"""
    lis = "".join(f'<li>{f"<i>{img(face, "")}</i>" if face else ""}<q>{t}</q><cite><b>{n}</b>{f"<span>{r}</span>" if r else ""}</cite></li>' for t, n, r, face in items)
    return f'<ul class="voices v{len(items)} rv">{lis}</ul>' + (f'<p class="voices-more rv"><a class="more" href="{more_to}">{more_text}{ic("arr")}</a></p>' if more_to else "")
def chapter(n, label):
    """구간 맨 위의 작은 장 표시: 번호 + 웃는 곡선 + 이름 — chapter("02", "사회성 프로그램")"""
    return f'<p class="chap rv"><b>{n}</b><i aria-hidden="true"></i><span>{label}</span></p>'

def cta_band(h2="아이에 대해 궁금한 점,<br>편하게 물어보세요", p="전화 · 카카오톡 · 네이버 예약 중 편한 방법으로 연락 주시면 초기 상담 일정을 안내해 드립니다."):
    A = ic("arr")
    return (f'<section class="cta"><div class="wrap cta-in"><div class="cta-tx rv"><h2>{h2}</h2><p>{p}</p></div>'
            f'<ul class="cta-ways rv"><li><a href="{href("contact")}">{ic("cal")}<b>상담 문의하기</b>{A}</a></li>'
            f'<li><a href="{KAKAO}" target="_blank" rel="noopener">{ic("chat")}<b>카카오톡 상담</b>{A}</a></li>'
            f'<li><a href="{NBOOK}" target="_blank" rel="noopener">{ic("check")}<b>네이버 예약</b>{A}</a></li></ul></div></section>\n')

# ── 틀
def _mega():
    out = []
    for m in MENU:
        paths = " ".join("/" + f for f, _, _ in m["items"])
        links = "".join(f'<a href="{href(f)}"><b>{t}</b><span>{d}</span></a>' for f, t, d in m["items"])
        out.append(f'<div class="wrap mega-p" data-paths="{paths}"><div class="mega-l"><b>{m["title"]}</b><p>{m["desc"]}</p></div><div class="mega-r">{links}</div></div>')
    return "".join(out)
def _drawer():
    b1 = "".join(f'<button type="button"{" class=\"on\"" if i == 0 else ""}{" data-centers" if m["key"] == "about" else ""}>{m["title"].replace("스텝스마트성장", "스텝<wbr>스마트<wbr>성장")}</button>' for i, m in enumerate(MENU))
    ps = "".join(f'<div class="dr-p{" on" if i == 0 else ""}"><b>{m["title"]}</b>' + "".join(f'<a href="{href(f)}"><span>{t}</span></a>' for f, t, _ in m["items"]) + "</div>" for i, m in enumerate(MENU))
    cta = (f'<div class="dr-cta">{btn("상담 문의하기", href("contact"))}<a class="btn btn-line dr-login" href="/member/login">로그인</a></div>')
    return f'<div class="drawer" id="drawer" aria-label="전체 메뉴"><div class="dr-1">{b1}</div><div class="dr-2">{ps}{cta}</div></div>'
def _find():
    rows_ = "".join(f'<li><div class="find-row"><b>{b["short"]}</b><span><em>{b["does"]}</em>{b["addr"]} <i class="nb">{b["addr2"]}</i></span>'
                    + (f'<a href="tel:{b["tel"].replace("-", "")}">{b["tel"]}</a>' if b["tel"] else f'<a href="{href("centers")}#{b["key"]}">위치 보기</a>') + "</div></li>" for b in BRANCHES)
    return f'<div class="find" id="find"><ul>{rows_}</ul><a class="find-all" href="{href("centers")}">센터 안내 · 오시는 길 전체 보기{ic("arr")}</a></div>'

# 동그란 SNS 아이콘(직접 그린 것). 글자는 동그라미 바탕색(--sb)으로 칠해 뚫린 것처럼 — 올렸을 때 바탕과 함께 반전된다
SNS = dict(
    kakao='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 6.500c-6.100 0-11 3.900-11 8.700 0 3.100 2 5.800 5.100 7.300l-.900 3.500c-.100.400.300.700.700.500l4.200-2.800c.600.100 1.200.100 1.900.100 6.100 0 11-3.900 11-8.600S22.100 6.500 16 6.500z"/><text x="16" y="17.500" text-anchor="middle" font-size="6.200" font-weight="800" font-family="Arial, sans-serif" letter-spacing=".2" fill="var(--sb)">TALK</text></svg>',
    blog='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M8.500 7h15A3.500 3.500 0 0 1 27 10.500v8A3.500 3.500 0 0 1 23.500 22H18l-2 3.200-2-3.200H8.500A3.500 3.500 0 0 1 5 18.500v-8A3.500 3.500 0 0 1 8.500 7z"/><text x="16" y="17.200" text-anchor="middle" font-size="7.400" font-weight="800" font-family="Arial, sans-serif" fill="var(--sb)">blog</text></svg>',
    insta='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.200" aria-hidden="true"><rect x="7" y="7" width="18" height="18" rx="5.500"/><circle cx="16" cy="16" r="4.300"/><circle cx="21.300" cy="10.700" r=".700" fill="currentColor" stroke-width="1.400"/></svg>',
)
def sns():
    return (f'<div class="ft-sns"><a href="{KAKAO}" target="_blank" rel="noopener" aria-label="카카오톡 채널 상담">{SNS["kakao"]}</a>'
            f'<a href="{BLOG}" target="_blank" rel="noopener" aria-label="네이버 블로그">{SNS["blog"]}</a>'
            f'<a href="{INSTA}" target="_blank" rel="noopener" aria-label="인스타그램">{SNS["insta"]}</a></div>')

def header():
    nav = "".join(f'<a href="{href(m["items"][0][0])}">{m["title"]}</a>' for m in MENU)
    return f'''<a class="sr" href="#main">본문 바로가기</a>
<header class="hd">
  <div class="wrap hd-in">
    <a class="logo" href="./" aria-label="{SITE} 첫 화면">{img("logo-mark.webp", "", lazy=False)}<span class="logo-t"><b>킨더윌</b><small>사회성언어전문센터</small></span></a>
    <nav class="gnb" id="gnb" aria-label="주 메뉴">{nav}</nav>
    <div class="hd-side">
      <button type="button" class="hd-find" aria-expanded="false" aria-controls="find" aria-label="센터 찾기">{ic("pin")}<span>센터 찾기</span></button>
      <a class="btn btn-brand hd-cta" href="{href("contact")}">상담 예약</a>
      <span class="hd-account" data-xms-account></span>
      <button type="button" class="burger" aria-label="메뉴 열기" aria-expanded="false" aria-controls="drawer"><i></i><i></i><i></i></button>
    </div>
  </div>
  <div class="mega" aria-hidden="true">{_mega()}</div>
  {_find()}
</header>
{_drawer()}
'''
def footer():
    brs = "".join(f'<li><b>{b["name"]}</b><span>{b["addr"]} <span class="nb">{b["addr2"]}</span></span>'
                  + (f'<a class="tel" href="tel:{b["tel"].replace("-", "")}">{b["tel"]}</a>' if b["tel"] else f'<a class="tel no" href="{href("centers")}#{b["key"]}">위치 보기</a>') + "</li>" for b in BRANCHES)
    hours = HOURS.replace(" · 토요일", "<br>토요일").replace(" · 일요일", "<br>일요일").replace(" (", "<br>(")
    return f'''<footer class="ft">
  <div class="wrap">
    <div class="ft-top">
      <div class="ft-brand"><a class="ft-logo" href="./">{img("logo-mark.webp", "")}<b>킨더윌 <span class="nb">사회성언어전문센터</span></b></a>
        <p>Kinder(우리 아이들) + Will(의지와 열정).<br>아이들이 주도적인 의지와 열정으로 행복한 꿈과 미래를 만들어 가는 곳입니다.</p>{sns()}</div>
      <div class="ft-hours"><b>운영 시간</b><p>{hours}</p></div>
    </div>
    <ul class="ft-br">{brs}</ul>
    <div class="ft-bot"><nav aria-label="아래 메뉴"><a href="{href("privacy")}">개인정보처리방침</a><a href="{href("centers")}">오시는 길</a><a href="{href("contact")}">상담 문의</a></nav>
      <span class="ft-copy">대표 이유진 · © 킨더윌 사회성언어전문센터</span>
      <span class="ft-make"><a class="ft-ask" href="https://portfolio.plators.com" target="_blank" rel="noopener">홈페이지 제작문의</a></span></div>
  </div>
</footer>
<nav class="dock" aria-label="빠른 연락">
  <a href="{href("contact")}#call">{ic("tel")}전화</a><a href="{KAKAO}" target="_blank" rel="noopener">{ic("chat")}카카오톡</a>
  <a href="{href("centers")}">{ic("pin")}센터 찾기</a><a class="main" href="{href("contact")}">{ic("cal")}상담 문의</a>
</nav>
'''
def doc(file, title, desc, body, body_cls="", preload="", noindex=False):
    full = SITE if file == "index" else f"{title} | {SITE}"
    return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(full)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{SITE}">
<meta property="og:title" content="{e(full)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="images/og.jpg?v={V}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="theme-color" content="#ffffff">{'\n<meta name="robots" content="noindex">' if noindex else ''}
<link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32.png?v={V}">
<link rel="icon" type="image/png" sizes="192x192" href="images/favicon-192.png?v={V}">
<link rel="apple-touch-icon" href="images/apple-touch-icon.png?v={V}">
<script>document.documentElement.className="js"</script>
<link rel="preload" as="font" type="font/woff2" href="fonts/kw-pretendard.woff2?v={FV}" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="fonts/kw-round.woff2?v={FV}" crossorigin>
{preload}<link rel="stylesheet" href="css/style.css?v={V}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" media="print" onload="this.media='all'">
<script src="js/site.js?v={V}" defer></script>
</head>
<body{f' class="{body_cls}"' if body_cls else ''}>
{header()}{body}{footer()}</body>
</html>
'''
def subpage(file, h1, lead, inner, bg="c3wait", title=None, desc=None, body_cls="", ph_cls="", cta=True, group=None, tabs=True, say="", bg_pos=""):
    """하위 페이지: 머리(글 왼쪽 + 큰 사진 오른쪽) → 형제 탭 → 본문(inner: sec(...) · band(...) · scene(...) 들을 이은 것) → 상담 띠
       say = 그 페이지의 감성 한 문장(부모의 마음에 말을 거는 글 — 있으면 제목 아래 크게), bg_pos = 머리 사진에서 보일 자리"""
    g = group or GROUP_OF.get(file); m = next((x for x in MENU if x["key"] == g), None)
    crumb = f'<nav class="crumb" aria-label="현재 위치"><a href="./">홈</a>' + (f'<i></i><a href="{href(m["items"][0][0])}">{m["title"]}</a>' if m and m["title"].replace(" ", "") != h1.replace(" ", "") else "") + f'<i></i><span>{h1}</span></nav>'
    sub = ""
    if m and tabs and len(m["items"]) > 1:
        sub = ('<div class="subnav"><div class="wrap"><div class="seg coral" role="navigation" aria-label="' + m["title"] + ' 메뉴">'
               + "".join(f'<a href="{href(f)}"{" class=\"on\" aria-current=\"page\"" if f == file else ""}>{t}</a>' for f, t, _ in m["items"]) + "</div></div></div>\n")
    if held(bg): bg = SIGN_HOLD[bg]
    ph = (f'<section class="ph{" " + ph_cls if ph_cls else ""}"><div class="wrap ph-in"><div class="ph-tx">{crumb}<h1>{h1}</h1>{f"<p class=\"ph-say\">{say}</p>" if say else ""}{f"<p class=\"ph-lead\">{lead}</p>" if lead else ""}</div>'
          f'<figure class="ph-img">{img(bg, "", lazy=False, extra=' fetchpriority="high"' + (f' style="object-position:{bg_pos}"' if bg_pos else ""))}</figure></div></section>\n')
    body = ph + sub + f'<main id="main">\n{inner}</main>\n' + (cta_band() if cta else "")
    return doc(file, title or h1, desc or re.sub(r"<[^>]+>", "", lead), body, body_cls=("sub " + body_cls).strip())
def write(file, html):
    (ROOT / f"{file}.html").write_text(html, encoding="utf-8", newline="\n"); print("쓴 것", f"{file}.html", len(html) // 1024, "KB")
