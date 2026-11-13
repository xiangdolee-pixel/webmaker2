# bsf 페이지 만들기 (머리 · 꼬리 · 지도 · 아이콘을 모든 페이지에 똑같이). 실행: python bsf/_dev/gen.py
# 만든 html 이 결과물이다 — 고칠 때는 이 파일을 고치고 다시 돌린다. 세계지도 점은 _dev/worldmap.py
import io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icons import svg as icon
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = '20261112c'
VIMEO = ''  # 첫 화면 배경 영상 (vimeo.com/<숫자>) — 비우면 사진 슬라이드만

NAV = [('about.html', '회사소개'), ('capability.html', '생산역량'), ('works.html', '납품실적'), ('brand.html', '자체브랜드')]

def head(title, desc, body_cls, preload=''):
    return f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="images/og.jpg">
<meta name="theme-color" content="#081a26">
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="images/favicon-192.png">
<link rel="apple-touch-icon" href="images/apple-touch-icon.png">
{preload}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="css/style.css?v={V}">
<script src="js/site.js?v={V}" defer></script>
</head>
<body class="{body_cls}">
<a class="sr" href="#main">본문 바로가기</a>
<header class="hd">
  <div class="wrap hd-in">
    <a class="logo" href="./" aria-label="BSF COMPANY 처음으로"><img src="images/favicon-192.png" alt="" width="42" height="42"><span>BSF COMPANY<small>GLOBAL APPAREL SOURCING</small></span></a>
    <nav class="gnb" aria-label="주 메뉴" data-xms-menu>
''' + ''.join(f'      <a href="{h}" data-xms-item>{t}</a>\n' for h, t in NAV) + '''      <a href="contact.html" class="cta">생산 문의</a>
    </nav>
    <span class="hd-account" data-xms-account></span>
    <button class="nav-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false"><i></i><i></i><i></i></button>
  </div>
</header>
'''

FOOT = '''
<footer class="ft">
  <div class="wrap">
    <div class="ft-top">
      <div>
        <a class="logo" href="./"><img src="images/favicon-192.png" alt="" width="42" height="42"><span>BSF COMPANY<small>GLOBAL APPAREL SOURCING</small></span></a>
        <p class="ft-slogan">Challenge<br><span>Inspiration.</span></p>
      </div>
      <nav class="ft-nav" aria-label="아래 메뉴">
        <a href="about.html">회사소개</a><a href="capability.html">생산역량</a><a href="works.html">납품실적</a><a href="brand.html">자체브랜드</a><a href="contact.html">생산 문의</a>
      </nav>
    </div>
    <p class="ft-info"><span>BSF COMPANY Co., Ltd.</span><span>대표 오은총</span><br><span>서울특별시 구로구 디지털로 271, 벽산디지털밸리 3차 110호</span></p>
    <p class="ft-copy">© BSF COMPANY. All rights reserved.</p>
  </div>
</footer>
<a class="fab" href="contact.html" aria-label="생산 문의하기"><i aria-hidden="true"></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>생산 문의</a>
</body>
</html>
'''

CTA = '''
  <section class="cta-band sec">
    <div class="wrap">
      <div class="rv">
        <h2>만들고 싶은 옷이 있나요?<br>디자인 한 장이면 시작할 수 있습니다.</h2>
        <p>품목 · 수량 · 납기만 알려 주시면, 맞는 생산지와 원가를 제안드립니다.</p>
      </div>
      <div class="rv d1"><a class="btn white" href="contact.html">생산 문의하기</a></div>
    </div>
  </section>
'''

LOGOS = [('deus', 'DEUS EX MACHINA', ''), ('dewalt', 'DEWALT', 'wide'), ('volcom', 'VOLCOM Workwear', ''), ('t1-goalstudio', 'T1 x GOALSTUDIO', 'wide'),
         ('muscle-armed', 'MUSCLE ARMED', ''), ('sportstribe', 'SPORTS TRIBE', ''), ('skmagic', 'SK magic', ''), ('dewalt-heritage', 'DEWALT HERITAGE', ''),
         ('yale', 'Yale', ''), ('ebbets-field', 'Ebbets Field', 'wide'), ('instantfunk', 'INSTANTFUNK', 'wide'), ('nature-trail', 'NATURE TRAIL', 'wide')]

def logo_rows():
    def row(items, rev):
        imgs = ''.join(f'<img src="images/buyers/{f}.png" alt="{a}" class="{c}" loading="lazy">' for f, a, c in items)
        dup = ''.join(f'<img src="images/buyers/{f}.png" alt="" class="{c}" loading="lazy" aria-hidden="true">' for f, a, c in items)
        return f'<div class="logos{" rev" if rev else ""}"><div class="logos-track">{imgs}{dup}{dup}{dup}</div></div>'
    return row(LOGOS[:6], False) + row(LOGOS[6:], True)

# ───── 품목 (아이콘) ─────
CATS = [('woven', 'WOVEN', '우븐 · 아우터', ['자켓', '윈드브레이커', '다운 점퍼', '가죽 자켓', '무스탕', '데님 자켓', '블라우스', '원피스', '스커트']),
        ('knit', 'KNIT', '니트 · 컷앤소', ['라운드 티셔츠', '폴로 티셔츠', '저지', '맨투맨', '쭈리 후디', '집업', '스웨터', '피그먼트 셔츠', '다잉 셔츠']),
        ('bottom', 'BOTTOM', '하의', ['면 팬츠', '데님 팬츠', '우븐 팬츠', '스커트 ', '데님 오버롤']),
        ('acc', 'ACC', '잡화', ['볼캡', '비니', '버킷햇', '베레모', '더플백', '양말'])]
def cats():
    out = []
    for i, (f, en, ko, items) in enumerate(CATS):
        lis = ''.join(f'<li>{icon(n)}<span>{n.strip()}</span></li>' for n in items)
        out.append(f'<article class="cat rv d{i % 2}"><div class="cat-img"><img src="images/items/{f}.webp" alt="" loading="lazy" width="800" height="1000"><h3>{en}<small>{ko} · {len(items)}개 품목</small></h3></div><div class="cat-body"><ul class="icons">{lis}</ul></div></article>')
    return '<div class="cats">' + ''.join(out) + '</div>'

STEPS = [('design', '디자인 의뢰', '스케치 · 레퍼런스 · 작업지시서, 어떤 형태든 괜찮습니다.'),
         ('pattern', '패턴 · 샘플 개발', '패턴을 뜨고 샘플을 만들어 핏과 디테일을 맞춥니다.'),
         ('material', '원부자재 매칭', '원단 · 부자재를 찾아 원가와 품질에 맞게 제안합니다.'),
         ('costing', '원가 · 생산지 결정', '원부자재와 생산지 조합별 원가를 비교해 정합니다.'),
         ('production', '생산 · 품질관리', '현지 상주 관리자가 공정마다 확인하고 검품합니다.'),
         ('delivery', '입고', '검침 · 포장 후 약속한 날짜에 입고합니다.')]
def flow():
    return '<ol class="flow">' + ''.join(f'<li class="step rv d{min(i, 4)}"><figure><img src="images/process/{f}.webp" alt="" loading="lazy" width="900" height="678"></figure><div><span class="n"></span><h3>{t}</h3><p>{d}</p></div></li>' for i, (f, t, d) in enumerate(STEPS)) + '</ol>'

# ───── 세계지도 (worldmap.py 와 같은 투영) ─────
W, H = 1600, 596
def xy(lon, lat):
    if lon < -170: lon += 360
    return round((lon + 170) / 360 * W, 1), round((78 - lat) / 134 * H, 1)
CITIES = [(121.6, 38.9), (124.4, 40.1), (120.4, 36.1), (117.0, 36.7), (119.4, 32.4), (120.9, 32.0), (121.5, 31.2), (120.2, 30.3), (121.6, 29.9),
          (115.9, 28.7), (113.3, 23.1), (105.8, 21.0), (106.7, 10.8), (96.2, 16.8), (90.4, 23.8)]
SEOUL = (126.98, 37.57)
MARKETS = [('NORTH AMERICA', '북미 바이어', -98, 40, -40, -30), ('EUROPE', '유럽 바이어', 8, 49, -10, -34), ('OCEANIA', '오세아니아 바이어', 146, -33, 26, 24)]
CALLOUTS = [('KOREA · HQ', '서울 본사', 126.98, 37.57, 56, -52, 'hq'), ('CHINA', '10개 도시 · 우븐 · 니트 · 모자 · 원단', 112, 34, -170, -64, ''),
            ('VIETNAM', '호찌민 · 하노이 · 아우터 · 데님', 106.2, 15.5, 70, 46, ''), ('MYANMAR', '양곤 · 아우터 대량', 96.2, 16.8, -120, 52, ''),
            ('BANGLADESH', '다카 · 팬츠', 90.4, 23.8, -150, -6, '')]
def arc(a, b, lift=.28):
    (x1, y1), (x2, y2) = a, b
    d = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** .5
    return f'M{x1},{y1} Q{(x1 + x2) / 2},{min(y1, y2) - d * lift} {x2},{y2}'
def world():
    hq = xy(*SEOUL)
    parts = ['<defs><linearGradient id="arc-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff8f33"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></linearGradient></defs>']
    for lon, lat in CITIES:
        parts.append(f'<path class="arc" d="{arc(xy(lon, lat), hq)}"/>')
    for en, ko, lon, lat, dx, dy in MARKETS:
        parts.append(f'<path class="arc ex" d="{arc(hq, xy(lon, lat), .22)}"/>')
    for lon, lat in CITIES:
        x, y = xy(lon, lat)
        parts.append(f'<g class="pin"><circle class="ring" cx="{x}" cy="{y}" r="4"/><circle class="core" cx="{x}" cy="{y}" r="4"/></g>')
    for en, ko, lon, lat, dx, dy in MARKETS:
        x, y = xy(lon, lat)
        parts.append(f'<g class="pin mk"><circle class="ring" cx="{x}" cy="{y}" r="5.5"/><circle class="core" cx="{x}" cy="{y}" r="5.5"/></g>')
        parts.append(callout(x, y, dx, dy, en, ko, 'mk'))
    x, y = hq
    parts.append(f'<g class="pin hq"><circle class="ring" cx="{x}" cy="{y}" r="7"/><circle class="core" cx="{x}" cy="{y}" r="7"/></g>')
    for en, ko, lon, lat, dx, dy, cls in CALLOUTS:
        parts.append(callout(*xy(lon, lat), dx, dy, en, ko, cls))
    return (f'<div class="world-wrap"><div class="world"><img src="images/world-dots.svg?v={V}" alt="" width="{W}" height="{H}" loading="lazy">'
            f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="BSF 글로벌 생산 네트워크: 서울 본사와 중국 · 베트남 · 미얀마 · 방글라데시 생산 거점, 북미 · 유럽 · 오세아니아 바이어">' + ''.join(parts) + '</svg></div></div>')
def callout(x, y, dx, dy, en, ko, cls):
    ex, ey = x + dx, y + dy
    anchor = 'start' if dx >= 0 else 'end'
    tx = ex + (6 if dx >= 0 else -6)
    return (f'<g class="callout {cls}"><line x1="{x}" y1="{y}" x2="{ex}" y2="{ey}"/><circle cx="{ex}" cy="{ey}" r="1.8" fill="#fff"/>'
            f'<text x="{tx}" y="{ey - 5}" text-anchor="{anchor}">{en}</text><text class="ko" x="{tx}" y="{ey + 17}" text-anchor="{anchor}">{ko}</text></g>')

COUNTRIES = [('CN', 'CHINA', '중국', [('다롄 · 단둥', '우븐'), ('칭다오', '니트 · 스웨터'), ('닝보 · 난퉁 · 난창', '니트 · 우븐'), ('지난', '데님'), ('양저우', '모자'), ('상하이 · 항저우 · 광저우', '원단 · 부자재 · 가방')]),
             ('VN', 'VIETNAM', '베트남', [('호찌민', '아우터 · 데님'), ('하노이', '아우터 · 데님')]),
             ('MM', 'MYANMAR', '미얀마', [('양곤', '다운 · 패딩 · 레인 자켓')]),
             ('BD', 'BANGLADESH', '방글라데시', [('다카', '팬츠')])]
def countries():
    return '<div class="countries">' + ''.join(f'<article class="country rv d{i}"><div class="code"><b>{c}</b><span>{en}</span></div><h3>{ko}</h3><ul>{"".join(f"<li>{a}<b>{b}</b></li>" for a, b in cities)}</ul></article>' for i, (c, en, ko, cities) in enumerate(COUNTRIES)) + '</div>'
LEGEND = '<ul class="globe-legend"><li><i class="hq"></i>서울 본사</li><li><i></i>생산 · 소싱 거점</li><li><i class="mk"></i>바이어 시장</li></ul>'

def write(name, html):
    io.open(os.path.join(ROOT, name), 'w', encoding='utf8', newline='\n').write(html)
    print('wrote', name, len(html))

def page_hero(img, eyebrow, title, lead):
    return f'''  <section class="page-hero"><div class="ph-bg" style="background-image:url({img})"></div>
    <div class="wrap">
      <p class="eyebrow rv">{eyebrow}</p>
      <h1 class="title rv d1">{title}</h1>
      <p class="lead rv d2">{lead}</p>
    </div>
  </section>'''

# ═════════════ HOME ═════════════
SLIDES = [('port', 'GLOBAL SOURCING NETWORK'), ('campaign', 'BRAND-GRADE PRODUCTION'), ('detail', 'CRAFTED IN DETAIL')]
slides = ''.join(f'<div class="slide{" on" if i == 0 else ""}"><picture><source media="(max-width: 767px)" srcset="images/hero-{n}-m.webp"><img src="images/hero-{n}.webp" alt="" width="1920" height="1076"{" fetchpriority=\"high\"" if i == 0 else " loading=\"lazy\""}></picture></div>' for i, (n, c) in enumerate(SLIDES))
caps = ''.join(f'<span data-cap{" hidden" if i else ""}>{c}</span>' for i, (n, c) in enumerate(SLIDES))
home = head('BSF COMPANY — 글로벌 의류 OEM · ODM 소싱 파트너', '17년 소싱 경험과 4개국 16개 도시 생산 네트워크. T1 월즈 유니폼부터 글로벌 브랜드까지, 디자인 한 장에서 입고까지 BSF가 만듭니다.', 'has-hero',
            '<link rel="preload" as="image" href="images/hero-port.webp" media="(min-width: 768px)">\n') + f'''
<main id="main">
  <section class="hero">
    <div class="slides">{slides}</div>
    {f'<div class="hero-video" data-vimeo="{VIMEO}" aria-hidden="true"></div>' if VIMEO else ""}
    <div class="hero-cap" aria-hidden="true"><span class="count">01</span><span class="bar"><i></i></span><span>03</span><span>{caps}</span></div>
    <div class="wrap hero-in">
      <p class="hero-kicker">OEM · ODM · SOURCING</p>
      <h1><span><i>Global apparel</i></span><span><i>sourcing <em class="o">partner.</em></i></span></h1>
      <p class="hero-ko">디자인 한 장에서 매장 입고까지.<br><b>17년 소싱 경험과 4개국 생산 네트워크</b>로 브랜드의 옷을 만듭니다.</p>
      <div class="hero-cta"><a class="btn solid" href="contact.html">생산 문의하기</a><a class="btn line" href="capability.html">생산역량 보기</a></div>
    </div>
    <span class="scroll-cue" aria-hidden="true"></span>
    <div class="hero-stats"><ul>
      <li><b><span data-count="17">0</span><sup>+</sup></b><span>년 소싱 경력</span></li>
      <li><b><span data-count="4">0</span></b><span>개국 생산 거점</span></li>
      <li><b><span data-count="16">0</span></b><span>개 도시 네트워크</span></li>
      <li><b><span data-count="25">0</span><sup>+</sup></b><span>가지 생산 품목</span></li>
    </ul></div>
  </section>

  <section class="sec">
    <div class="wrap">
      <p class="eyebrow rv">WHO WE ARE</p>
      <p class="statement">BSF는 의류 해외생산 소싱 전문 기업입니다. <span class="hl">17년</span> 동안 쌓아 온 4개국 공장 네트워크로, 브랜드의 디자인이 <span class="hl">원가 · 납기 · 품질</span>을 모두 지킨 한 벌의 옷이 되기까지 처음부터 끝까지 설계합니다.</p>
      <div class="state-foot rv"><p>BSF COMPANY 대표<b>오은총</b></p><a class="btn line" href="about.html">회사소개</a></div>
    </div>
  </section>

  <section class="spot">
    <div class="spot-grid">
      <div class="spot-main"><img src="images/works/t1-jacket-closeup.webp" alt="T1 2023 월즈 유니폼 자켓 클로즈업" loading="lazy" width="1477" height="1065">
        <div class="spot-tag"><small>2023 WORLDS</small><strong>페이커와 T1 선수단이<br>월즈 무대에서 입은 유니폼</strong></div></div>
      <div class="spot-body">
        <p class="eyebrow rv">WORN ON THE WORLD STAGE</p>
        <h2 class="title rv d1">Made for<br>the <span class="gold">world stage.</span></h2>
        <p class="lead rv d2">2023 리그 오브 레전드 월드 챔피언십. 페이커와 T1 선수단이 세계 무대에서 입은 유니폼 자켓과 팬츠를 BSF가 생산했습니다. 스폰서 로고가 빼곡한 기능성 유니폼을 대회 일정에 맞춰 만들었습니다.</p>
        <dl class="spot-facts rv d2"><div><dt>클라이언트</dt><dd>T1 × GOALSTUDIO</dd></div><div><dt>품목</dt><dd>유니폼 자켓 · 팬츠</dd></div><div><dt>무대</dt><dd>2023 월드 챔피언십</dd></div></dl>
        <div class="spot-thumbs rv d3"><figure><img src="images/works/t1-pants-pair.webp" alt="T1 2023 월즈 유니폼 팬츠 앞 · 뒤" loading="lazy"></figure><figure><img src="images/works/t1-windbreaker.webp" alt="T1 2023 월즈 유니폼 후드 자켓 앞 · 뒤" loading="lazy"></figure><figure><img src="images/works/t1-team-stage.webp" alt="월즈 무대의 T1 선수단 뒷모습" loading="lazy"></figure></div>
        <div class="rv d3"><a class="btn line" href="works.html#t1">납품실적 보기</a></div>
      </div>
    </div>
  </section>

  <section class="sec paper2">
    <div class="wrap">
      <div class="sec-head row">
        <div><p class="eyebrow rv">WHAT WE MAKE</p><h2 class="title rv d1">All fashion items,<br><span class="o">one partner.</span></h2></div>
        <p class="lead rv d2">아우터부터 티셔츠, 데님, 모자와 양말까지. 품목마다 가장 잘 만드는 공장을 연결합니다.</p>
      </div>
      {cats()}
    </div>
  </section>

  <section class="sec deep">
    <div class="wrap">
      <div class="sec-head row">
        <div><p class="eyebrow rv">HOW WE WORK</p><h2 class="title rv d1">Sketch to<br>shipment.</h2></div>
        <p class="lead rv d2">디자인 의뢰부터 입고까지 6단계. 어느 단계에서 시작해도 됩니다. 스케치만 있어도, 완성된 작업지시서가 있어도 괜찮습니다.</p>
      </div>
      {flow()}
    </div>
  </section>

  <section class="sec globe-sec">
    <div class="wrap">
      <div class="sec-head row">
        <div><p class="eyebrow rv">GLOBAL NETWORK</p><h2 class="title rv d1">One network,<br><span class="o">four countries.</span></h2></div>
        <p class="lead rv d2">서울 본사를 중심으로 중국 · 베트남 · 미얀마 · 방글라데시 16개 도시의 생산 · 소싱 거점을 연결해, 북미 · 유럽 · 오세아니아의 바이어에게 납품합니다.</p>
      </div>
      {world()}
      {LEGEND}
      {countries()}
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head row">
        <div><p class="eyebrow rv">PARTNER FACTORIES</p><h2 class="title-ko rv d1">글로벌 브랜드를 만들어 온<br>공장이 BSF의 옷을 만듭니다</h2></div>
        <a class="btn line rv d2" href="capability.html#factories">협력 공장 자세히</a>
      </div>
      <div class="fac-cards">
        <a class="fac-card rv" href="capability.html#ningbo"><img src="images/factory/ningbo-sewing.webp" alt="" loading="lazy"><div class="in-c"><div><span class="where">NINGBO · CHINA · KNIT</span><h3>HUAHE KNITWEAR</h3></div><div><span class="big"><span data-count="2">0</span>M+<small>장 / 연</small></span><p>2003년부터 · 400명 · WRAP 골드 · adidas · Disney 인증</p></div></div></a>
        <a class="fac-card rv d1" href="capability.html#yangon"><img src="images/factory/yangon-line2.webp" alt="" loading="lazy"><div class="in-c"><div><span class="where">YANGON · MYANMAR · OUTER</span><h3>SUJIN CO., LTD.</h3></div><div><span class="big"><span data-count="1150">0</span><small>명</small></span><p>11개 라인 · 다운 · 패딩 · 레인 자켓 · ZARA · E-LAND 생산</p></div></div></a>
        <a class="fac-card rv d2" href="capability.html#yangzhou"><img src="images/factory/yangzhou-line.webp" alt="" loading="lazy"><div class="in-c"><div><span class="where">YANGZHOU · CHINA · CAP</span><h3>HEHAN CLOTHING</h3></div><div><span class="big"><span data-count="100">0</span>K<small>개 / 월</small></span><p>7개 라인 · 볼캡 · 니트 모자 · 버킷햇 · adidas · Patagonia 생산</p></div></div></a>
      </div>
    </div>
  </section>

  <section class="sec paper2">
    <div class="wrap">
      <div class="sec-head row">
        <div><p class="eyebrow rv">SELECTED WORKS</p><h2 class="title rv d1">Made by BSF.</h2></div>
        <a class="btn line rv d2" href="works.html">납품실적 전체 보기</a>
      </div>
      <div class="works">
        <a class="work w-a rv" href="works.html#armed"><img class="at-top" src="images/works/armed-jersey.webp" alt="" loading="lazy"><div class="work-txt"><small>무신사 판매 1위</small><h3>MUSCLE ARMED 23 저지 티셔츠</h3><p>스트리트 · 피트니스 · 하프집 · 자켓 · 더플백</p></div></a>
        <a class="work w-b rv d1" href="works.html#daegu"><img src="images/works/daegu-ai.webp" alt="" loading="lazy"><div class="work-txt"><small>FOOTBALL</small><h3>대구FC 트레이닝웨어</h3><p>GOALSTUDIO</p></div></a>
        <a class="work w-c rv d2" href="works.html#nightwalk"><img src="images/works/nightwalk-ai.webp" alt="" loading="lazy"><div class="work-txt"><small>EVENT</small><h3>한강 · 부산 나이트워크</h3><p>참가자 티셔츠 · 양말</p></div></a>
        <a class="work w-d rv" href="brand.html"><img src="images/brand/camp.webp" alt="" loading="lazy"><div class="work-txt"><small>OWN BRAND</small><h3>NATURE TRAIL — 캠핑 아웃도어 자체 브랜드</h3><p>기획 · 생산 · 판매까지 직접</p></div></a>
      </div>
    </div>
  </section>

  <section class="sec ink" style="padding-top:110px;padding-bottom:110px">
    <div class="wrap">
      <div class="sec-head row" style="margin-bottom:56px"><div><p class="eyebrow rv">TRUSTED BY</p><h2 class="title-ko rv d1">함께한 브랜드</h2></div></div>
      {logo_rows()}
    </div>
  </section>

  <section class="brand-band sec">
    <div class="bg" style="background-image:url(images/brand/hike.webp)"></div>
    <div class="wrap">
      <p class="eyebrow rv">OUR OWN BRAND</p>
      <h2 class="title rv d1">NATURE TRAIL</h2>
      <p class="lead rv d2">BSF가 직접 기획 · 생산 · 판매하는 캠핑 아웃도어 브랜드입니다.<br>브랜드를 직접 운영해 봤기에, 바이어가 무엇을 걱정하는지 압니다.</p>
      <div class="rv d3" style="margin-top:34px"><a class="btn line" href="brand.html">브랜드 이야기</a></div>
      <div class="nt-strip">{''.join(f'<figure><img src="images/brand/{p}.webp" alt="네이처트레일 제품 화보" loading="lazy" width="700" height="1100"></figure>' for p in ['p14', 'p15', 'p06', 'p03', 'p13', 'p04'])}</div>
    </div>
  </section>
{CTA}
</main>
''' + FOOT
write('index.html', home)

# ═════════════ ABOUT ═════════════
VAL_ICONS = {
    'person': '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6"/><path d="M16.5 4.5l1.5 1.5 3-3"/></svg>',
    'factory': '<svg viewBox="0 0 24 24"><path d="M3 20V10l5 3V10l5 3V6h4l1 14Z"/><path d="M3 20h18"/><path d="M7 16h2M12 16h2"/></svg>',
    'cost': '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h3M13 12h3M8 16h3M13 16h3"/></svg>',
}
about = head('회사소개 | BSF COMPANY', 'BSF COMPANY — 17년 의류 해외생산 소싱 경험으로 ODM · OEM 토탈 패션 비즈니스 솔루션을 제공합니다.', 'has-page-hero') + f'''
<main id="main">
{page_hero('images/hero-port.webp', 'ABOUT BSF', 'Challenge<br><span class="o">Inspiration.</span>', '도전이 영감이 되는 회사. 산을 오르는 사람처럼, 한 벌 한 벌 끝까지 책임집니다.')}

  <section class="sec">
    <div class="wrap about-intro">
      <div class="about-logo rv"><img src="images/logo.png" alt="BSF COMPANY 로고 — 산과 수평선, challenge inspiration" width="297" height="400"></div>
      <div>
        <p class="eyebrow rv">CEO MESSAGE</p>
        <p class="quote rv d1">“17년 동안 수많은 공장과 오더를 거치며 배운 것은 하나입니다. <em>좋은 옷은 맞는 공장에서 나온다</em>는 것. BSF는 바이어의 옷에 가장 맞는 공장을 찾고, 그 옷이 입고될 때까지 직접 챙깁니다.”</p>
        <p class="sign rv d2">BSF COMPANY 대표<b>오은총</b></p>
      </div>
    </div>
  </section>

  <section class="sec paper2">
    <div class="wrap">
      <div class="sec-head"><p class="eyebrow rv">OUR VALUES</p><h2 class="title-ko rv d1">작지만 깊게, 끝까지</h2></div>
      <div class="values">
        <div class="value rv"><i>{VAL_ICONS['person']}</i><h3>바뀌지 않는 담당자</h3><p>문의부터 입고까지 같은 소싱팀이 맡습니다. 처음 나눈 이야기가 끝까지 이어집니다.</p></div>
        <div class="value rv d1"><i>{VAL_ICONS['factory']}</i><h3>현장에 있는 관리자</h3><p>해외 생산지에 상주하는 관리자가 공정을 직접 보고, 문제가 생기기 전에 잡습니다.</p></div>
        <div class="value rv d2"><i>{VAL_ICONS['cost']}</i><h3>숨기지 않는 원가</h3><p>원부자재와 생산지 조합별 원가를 함께 보며 정합니다. 왜 이 가격인지 설명할 수 있습니다.</p></div>
      </div>
    </div>
  </section>

  <section class="sec dark">
    <div class="wrap about-intro">
      <div><p class="eyebrow rv">HISTORY</p><h2 class="title-ko rv d1">걸어온 길</h2><p class="lead rv d2">대표의 17년 소싱 경력 위에 세운 회사입니다.</p></div>
      <ol class="timeline">
        <li class="rv"><b>17+ YEARS</b><span>의류 해외생산 소싱 실무 — 중국 · 베트남 · 미얀마 · 방글라데시 생산 네트워크 구축</span></li>
        <li class="rv d1"><b>2021. 11</b><span>BSF TRADING 설립</span></li>
        <li class="rv d2"><b>2022. 08</b><span>자체 브랜드 NATURE TRAIL 상표 등록 (제40-1895781호) · 브랜드 런칭</span></li>
        <li class="rv d3"><b>2023</b><span>T1 2023 월즈 유니폼 · 대구FC 트레이닝웨어(GOALSTUDIO) · 한강 · 부산 나이트워크 · MUSCLE ARMED 생산</span></li>
        <li class="rv d4"><b>2026. 01</b><span>법인 전환 — BSF COMPANY Co., Ltd.</span></li>
      </ol>
    </div>
  </section>

  <section class="sec">
    <div class="wrap about-intro">
      <div><p class="eyebrow rv">COMPANY</p><h2 class="title-ko rv d1">회사 정보</h2></div>
      <dl class="info-table rv d1">
        <div><dt>회사명</dt><dd>BSF COMPANY Co., Ltd.</dd></div>
        <div><dt>대표이사</dt><dd>오은총</dd></div>
        <div><dt>설립</dt><dd>2021년 11월 (BSF TRADING) · 2026년 1월 법인 전환</dd></div>
        <div><dt>사업 분야</dt><dd>브랜드 완사입(OEM 해외생산) · 자체 브랜드 전개(캠핑 아웃도어) · 해외 원부자재 소싱(원단 · 부자재 공급)</dd></div>
        <div><dt>생산 거점</dt><dd>중국 · 베트남 · 미얀마 · 방글라데시</dd></div>
        <div><dt>매출</dt><dd>연평균 30억 원</dd></div>
        <div><dt>주소</dt><dd>서울특별시 구로구 디지털로 271, 벽산디지털밸리 3차 110호</dd></div>
      </dl>
    </div>
  </section>
{CTA}
</main>
''' + FOOT
write('about.html', about)

# ═════════════ CAPABILITY ═════════════
WOVEN_PTS = [('다롄 · 상하이', 'WOVEN', 20, 82), ('지난', 'DENIM', 20, 64), ('베트남', 'WOVEN', 48, 46), ('베트남', 'DENIM', 48, 30), ('양곤', 'OUTER', 80, 14)]
KNIT_PTS = [('상하이', 'KNIT', 34, 82), ('칭다오', 'KNIT · SWEATER', 22, 58), ('닝보', 'KNIT', 70, 58), ('난창', 'KNIT', 42, 30), ('난퉁', 'KNIT', 66, 16)]
def mx_pts():
    out = []
    for k, pts in (('woven', WOVEN_PTS), ('knit', KNIT_PTS)):
        for name, sub, x, y in pts:
            out.append(f'<span class="mx" data-k="{k}" style="left:{x}%;bottom:{y}%"{" hidden" if k == "knit" else ""}><small>{sub}</small>{name}</span>')
    return ''.join(out)

FACTS = [
    ('ningbo', 'NINGBO HUAHE KNITWEAR', '중국 저장성 닝보 · 니트 전문 · 2003년 설립', 'images/factory/ningbo-sewing.webp', '20년 넘게 니트 의류만 만들어 온 공장입니다. adidas · Disney 공장 인증을 받았고, 2006년부터 해마다 WRAP 골드 인증을 유지하고 있습니다.',
     [('공장 면적', '15,000', '㎡'), ('인원', '400+', '명'), ('연 생산', '2,000,000', '장'), ('봉제 라인', '7', '개')],
     ['WRAP Gold', 'adidas 인증', 'Disney 인증', 'adidas · New Balance · Mizuno · Reebok · E-LAND · SPAO 생산'], ['ningbo-cutting', 'ningbo-detail', 'ningbo-packing']),
    ('yangon', 'SUJIN CO., LTD.', '미얀마 양곤 공업단지 · 아우터 전문 · 2018년 설립', 'images/factory/yangon-line2.webp', '다운 자켓 · 레인 자켓 · 스노 자켓 · 코트 같은 아우터를 대량으로 만드는, 한국인 관리진이 운영하는 공장입니다. 11개 라인, 1,150명이 일합니다.',
     [('인원', '1,150', '명'), ('봉제 라인', '11', '개'), ('월 생산', '50,000+', '장(점퍼)'), ('연 생산', '600,000', '장')],
     ['한국 · 유럽 수출', 'ZARA · Teenie Weenie · E-LAND 생산', '단침 미싱 600대'], ['yangon-cutting', 'yangon-fabric', 'yangon-pattern']),
    ('yangzhou', 'YANGZHOU HEHAN CLOTHING', '중국 장쑤성 양저우 · 모자 전문', 'images/factory/yangzhou-line.webp', '볼캡 · 니트 모자 · 버킷햇 · 베레모까지 원단 모자 전 품목을 만듭니다. 자동 재단기와 자수실, 검침 · 성형 라인을 갖췄습니다.',
     [('월 생산', '100,000', '개'), ('라인', '7', '개'), ('인원', '110', '명'), ('컴퓨터 미싱', '90', '대')],
     ['adidas · Patagonia · Alpha Industries · Teenie Weenie · E-LAND 생산'], ['yangzhou-cutting', 'yangzhou-cap']),
]
def facs():
    out = []
    for fid, name, where, img, desc, nums, chips, thumbs in FACTS:
        out.append(f'''<article class="fac rv" id="{fid}">
        <div class="fac-img" style="background-image:url({img})" role="img" aria-label="{name} 공장 내부"><span class="tag">PARTNER FACTORY</span></div>
        <div class="fac-body"><h3>{name}</h3><p class="where">{where}</p><p>{desc}</p>
          <dl class="fac-nums">{''.join(f'<div><dt>{a}</dt><dd>{b}<small>{c}</small></dd></div>' for a, b, c in nums)}</dl>
          <ul class="chips">{''.join(f'<li>{c}</li>' for c in chips)}</ul>
          <div class="fac-thumbs">{''.join(f'<img src="images/factory/{t}.webp" alt="" loading="lazy">' for t in thumbs)}</div></div>
      </article>''')
    return ''.join(out)
ROLE = [('DESIGN', '디자인 의뢰', '스케치 · 레퍼런스 사진 · 작업지시서 · 목표 단가와 수량', '어떤 형태든 받아 생산 가능한 사양으로 정리'),
        ('SAMPLE', '패턴 · 샘플', '핏 · 디테일 피드백', '패턴 제작, 1차 샘플 → 수정 샘플'),
        ('MATERIAL', '원부자재', '원하는 소재감 · 컬러', '원단 · 지퍼 · 단추 · 라벨 · 포장재 소싱과 제안 (스와치 제공)'),
        ('COSTING', '원가 · 생산지', '목표 단가 · 납기 확인', '원부자재 × 생산지 조합별 원가 시뮬레이션, 최적 루트 제안'),
        ('PRODUCTION', '생산 · 품질관리', '생산 승인(PP 샘플)', '현지 상주 관리자의 공정 관리 · 중간 검품 · 검침'),
        ('DELIVERY', '입고', '입고지 · 일정', '포장 · 선적 · 통관 · 입고 일정 관리')]
FAQ = [('최소 주문 수량(MOQ)은 얼마인가요?', '품목과 생산지에 따라 다릅니다. 같은 품목이라도 소량 · 고난도는 중국, 대량은 미얀마 · 베트남처럼 맞는 공장을 고르기 때문에 수량에 맞춰 제안드릴 수 있습니다. 예상 수량을 알려 주세요.'),
       ('디자인 스케치만 있어도 되나요?', '네. 스케치나 레퍼런스 사진만 있어도 패턴 · 샘플 개발부터 함께 진행합니다. 작업지시서가 있으면 더 빠릅니다.'),
       ('원단 · 부자재만 따로 공급받을 수 있나요?', '네. 상하이 · 항저우 · 광저우 네트워크를 통해 원단과 부자재만 따로 소싱해 공급합니다.'),
       ('샘플은 얼마나 걸리나요?', '품목과 난이도에 따라 다르며, 문의를 주시면 품목별 샘플 · 본생산 일정을 함께 안내드립니다.'),
       ('국내 입고 · 통관까지 맡길 수 있나요?', '네. 선적 · 통관 · 지정 창고 입고까지 일정에 맞춰 관리합니다.')]
cap = head('생산역량 | BSF COMPANY', '우븐 · 니트 · 하의 · 잡화 29개 품목, 4개국 16개 도시 생산 네트워크, 난이도 × 수량 소싱 전략, 협력 공장(닝보 HUAHE · 양곤 SUJIN · 양저우 HEHAN).', 'has-page-hero') + f'''
<main id="main">
{page_hero('images/factory/yangon-line.webp', 'CAPABILITY', 'Right factory,<br>right cost, <span class="o">right time.</span>', '무엇을, 어떻게, 어디서 만드는지 — BSF의 생산역량을 한 페이지에 담았습니다.')}

  <section class="sec paper2" id="items">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">WHAT WE MAKE</p><h2 class="title-ko rv d1">모든 패션 복종을 만듭니다</h2></div><p class="lead rv d2">여기 없는 품목도 문의해 주세요. 맞는 공장을 찾는 것이 BSF의 일입니다.</p></div>
      {cats()}
    </div>
  </section>

  <section class="sec" id="strategy">
    <div class="wrap matrix-wrap">
      <div>
        <p class="eyebrow rv">SOURCING STRATEGY</p>
        <h2 class="title-ko rv d1">난이도 × 수량으로<br>생산지를 설계합니다</h2>
        <p class="lead rv d2">같은 자켓이라도 소량 고난도 오더와 대량 기본 오더는 다른 공장에서 만들어야 합니다. BSF는 오더의 난이도와 수량을 보고 가장 맞는 생산지를 고릅니다.</p>
        <div class="matrix-points rv d3" style="margin-top:30px">
          <ul data-mk="woven"><li><b>고난도 · 소량</b><span>다롄 · 상하이(우븐), 지난(데님) — 섬세한 봉제와 빠른 샘플</span></li><li><b>중간 난이도 · 중량</b><span>베트남(우븐 · 데님) — 품질과 단가의 균형</span></li><li><b>대량 아우터</b><span>미얀마 양곤 — 다운 · 패딩 대량 생산</span></li></ul>
          <ul data-mk="knit" hidden><li><b>고난도 니트</b><span>상하이 — 특수 소재 · 디테일</span></li><li><b>중간 · 다양한 수량</b><span>칭다오(니트 · 스웨터) · 닝보 — 니트 전 품목</span></li><li><b>대량 기본물</b><span>난창 · 난퉁 — 티셔츠 · 맨투맨 대량</span></li></ul>
        </div>
      </div>
      <div class="rv d1">
        <div class="seg" id="matrix-seg" role="group" aria-label="소재 고르기"><button type="button" class="on" data-v="woven" aria-pressed="true">WOVEN</button><button type="button" data-v="knit" aria-pressed="false">KNIT</button></div>
        <div class="matrix" id="matrix"><span class="axis-y">DIFFICULTY<small>난이도</small></span><span class="axis-x">ORDER Q'TY<small>수량</small></span><div class="matrix-plot">{mx_pts()}</div></div>
      </div>
    </div>
  </section>

  <section class="sec deep" id="process">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">HOW WE WORK</p><h2 class="title rv d1">Sketch to<br>shipment.</h2></div></div>
      {flow()}
      <p class="flow-note rv">BSF는 바이어와 <b>원가 스터디</b>를 통해 원부자재를 최적으로 설계하며, 다양한 생산지 루트를 제안하고 <b>공정별 투명한 관리</b>를 통해 고객이 원하는 원가와 납기, 고품질의 제품을 제공합니다.</p>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head"><p class="eyebrow rv">WHO DOES WHAT</p><h2 class="title-ko rv d1">단계마다, 주실 것과 BSF가 하는 일</h2></div>
      <div class="table-scroll rv"><table class="role-table"><thead><tr><th>단계</th><th>바이어가 주실 것</th><th>BSF가 하는 일</th></tr></thead>
        <tbody>{''.join(f'<tr><th><small>{a}</small>{b}</th><td>{c}</td><td>{d}</td></tr>' for a, b, c, d in ROLE)}</tbody></table></div>
    </div>
  </section>

  <section class="sec globe-sec" id="network">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">GLOBAL SOURCING INFRA</p><h2 class="title rv d1">One network,<br><span class="o">four countries.</span></h2></div><p class="lead rv d2">품목마다 잘하는 공장이 다릅니다. BSF는 우븐 · 니트 · 데님 · 아우터 · 모자 · 원단까지 검증된 생산지를 연결합니다.</p></div>
      {world()}
      {LEGEND}
      {countries()}
    </div>
  </section>

  <section class="sec paper2" id="factories">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">PARTNER FACTORIES</p><h2 class="title-ko rv d1">함께 만드는 공장</h2></div><p class="lead rv d2">BSF와 오래 함께해 온 대표 협력 공장입니다. 글로벌 브랜드를 만들어 온 설비와 인력이 BSF의 오더를 만듭니다.</p></div>
      <div class="factories">{facs()}</div>
    </div>
  </section>

  <section class="sec" id="quality">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">QUALITY CONTROL</p><h2 class="title-ko rv d1">공정마다 확인합니다</h2></div><p class="lead rv d2">자동 재단부터 검품 · 검침 · 포장까지, 현지 상주 관리자가 직접 확인합니다.</p></div>
      <div class="qc">
        <figure class="rv"><img src="images/factory/ningbo-cutting.webp" alt="자동 재단기로 원단을 재단하는 모습" loading="lazy"><figcaption>자동 재단</figcaption></figure>
        <figure class="rv d1"><img src="images/factory/ningbo-detail.webp" alt="봉제 작업 모습" loading="lazy"><figcaption>봉제 공정 관리</figcaption></figure>
        <figure class="rv d2"><img src="images/factory/ningbo-inspection.webp" alt="완성품을 검품하는 모습" loading="lazy"><figcaption>검품 · 다림질</figcaption></figure>
        <figure class="rv d3"><img src="images/factory/ningbo-packing.webp" alt="완성품을 포장하는 모습" loading="lazy"><figcaption>검침 · 포장</figcaption></figure>
      </div>
    </div>
  </section>

  <section class="sec paper2" id="faq">
    <div class="wrap">
      <div class="sec-head"><p class="eyebrow rv">FAQ</p><h2 class="title-ko rv d1">자주 묻는 질문</h2></div>
      <div class="faq">{''.join(f'<details class="rv"><summary>{q}</summary><p>{a}</p></details>' for q, a in FAQ)}</div>
    </div>
  </section>
{CTA}
</main>
''' + FOOT
write('capability.html', cap)

# ═════════════ WORKS ═════════════
CASES = [
    ('t1', 'sports', 'E-SPORTS · GOALSTUDIO', 'T1 2023 월즈 유니폼 자켓 · 팬츠', '2023 리그 오브 레전드 월드 챔피언십. 페이커와 T1 선수단이 세계 무대에서 입은 유니폼 자켓과 팬츠를 생산했습니다. 스폰서 로고가 많은 기능성 유니폼을 대회 일정에 맞췄습니다.',
     [('클라이언트', 'T1 × GOALSTUDIO'), ('품목', '유니폼 자켓 · 팬츠'), ('분류', 'WOVEN')], ['works/t1-jacket-closeup', 'works/t1-pants-pair', 'works/t1-windbreaker', 'works/t1-team-stage']),
    ('armed', 'street', 'STREET · FITNESS', 'MUSCLE ARMED — 무신사 판매 1위 저지 티셔츠', '피트니스 스트리트 브랜드 머슬암드의 23 저지 티셔츠는 무신사 실시간 랭킹 1위에 올랐습니다. 하프집 · 자켓 · 더플백도 함께 생산했습니다.',
     [('클라이언트', 'MUSCLE ARMED'), ('품목', '저지 티 · 하프집 · 자켓 · 더플백'), ('분류', 'KNIT · WOVEN · ACC')], ['works/armed-jersey', 'works/armed-musinsa', 'works/armed-gymbag']),
    ('daegu', 'sports', 'FOOTBALL · GOALSTUDIO', '대구FC 트레이닝웨어', 'K리그 대구FC 선수단이 동계 훈련에서 입은 트레이닝 탑을 생산했습니다.',
     [('클라이언트', 'GOALSTUDIO · 대구FC'), ('품목', '트레이닝 탑'), ('분류', 'KNIT')], ['works/daegu-ai', 'works/daegu-kit', 'works/daegu-stretch']),
    ('nightwalk', 'event', 'EVENT · GOODS', '2023 한강 · 부산 나이트워크 티셔츠 · 양말', '수천 명이 함께 걷는 대규모 야간 걷기 행사의 참가자 티셔츠와 양말을 생산했습니다.',
     [('클라이언트', '나이트워크 (한강 · 부산)'), ('품목', '티셔츠 · 양말'), ('분류', 'KNIT · ACC')], ['works/nightwalk-ai', 'works/nightwalk-poster2', 'works/nightwalk-goods2']),
    ('naturetrail', 'brand', 'OWN BRAND', 'NATURE TRAIL — 캠핑 아웃도어 자체 브랜드', '다운 자켓 · 베스트 · 데님 · 조거 팬츠 · 맨투맨 · 그래픽 티셔츠까지, BSF가 직접 기획 · 생산 · 판매합니다.',
     [('브랜드', 'NATURE TRAIL'), ('품목', '아우터 · 하의 · 니트'), ('분류', 'WOVEN · KNIT · BOTTOM')], ['brand/p24', 'brand/p20', 'brand/p18', 'brand/p14', 'brand/p15']),
]
def cases():
    out = []
    for cid, k, kind, title, desc, meta, imgs in CASES:
        out.append(f'''<article class="case rv" id="{cid}" data-k="{k}">
        <div class="gallery" tabindex="0" aria-label="{title} 사진 — 옆으로 넘겨 보기">{''.join(f'<img src="images/{i}.webp" alt="{title} 사진" loading="lazy">' for i in imgs)}</div>
        <div class="case-body"><div><span class="kind">{kind}</span><h3>{title}</h3><p>{desc}</p></div>
          <dl class="case-meta">{''.join(f'<div><dt>{a}</dt><dd>{b}</dd></div>' for a, b in meta)}</dl></div>
      </article>''')
    return ''.join(out)
works = head('납품실적 | BSF COMPANY', 'T1 월즈 유니폼, 무신사 1위 MUSCLE ARMED, 대구FC, 나이트워크, DEWALT · VOLCOM · DEUS 등 BSF COMPANY 납품 실적.', 'has-page-hero') + f'''
<main id="main">
{page_hero('images/hero-campaign.webp', 'WORKS', 'Made by <span class="o">BSF.</span>', '세계 대회 무대의 선수단부터 수천 명이 걷는 행사, 무신사 랭킹 1위까지 — BSF가 만든 옷들입니다.')}

  <section class="sec ink" style="padding-top:90px;padding-bottom:90px">
    <div class="wrap">{logo_rows()}</div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="filter" id="case-filter" role="group" aria-label="분야 고르기">
        <button type="button" class="on" data-v="all" aria-pressed="true">전체</button><button type="button" data-v="sports" aria-pressed="false">스포츠 · e스포츠</button><button type="button" data-v="street" aria-pressed="false">스트리트</button><button type="button" data-v="event" aria-pressed="false">행사 · 단체</button><button type="button" data-v="brand" aria-pressed="false">자체 브랜드</button>
      </div>
      <div class="cases" id="cases">{cases()}</div>
    </div>
  </section>

  <section class="sec paper2">
    <div class="wrap">
      <div class="sec-head"><p class="eyebrow rv">MAIN BUYERS</p><h2 class="title-ko rv d1">함께한 브랜드</h2></div>
      <div class="logo-grid">{''.join(f'<div class="rv"><img src="images/buyers/{f}.png" alt="{a}" loading="lazy"></div>' for f, a, c in LOGOS)}</div>
    </div>
  </section>
{CTA}
</main>
''' + FOOT
write('works.html', works)

# ═════════════ BRAND ═════════════
NT_SQ = ['p24', 'p20', 'p21', 'p25', 'p22', 'p26', 'p18', 'p19', 'p10', 'p12']
brand = head('자체브랜드 NATURE TRAIL | BSF COMPANY', 'NATURE TRAIL — BSF COMPANY가 직접 기획 · 생산 · 판매하는 캠핑 아웃도어 기능성 캐주얼 브랜드.', 'has-page-hero') + f'''
<main id="main">
  <section class="brand-band page-hero" style="background:#1e2a1c">
    <div class="bg" style="background-image:url(images/brand/camp.webp)"></div>
    <div class="wrap">
      <p class="eyebrow rv">OUR OWN BRAND</p>
      <h1 class="title rv d1">NATURE TRAIL</h1>
      <p class="lead rv d2">Great Nature, Great Life. 캠핑 아웃도어 컨셉의 기능성 캐주얼 아웃도어 브랜드입니다.</p>
      <div class="hero-cta rv d3" style="opacity:1;animation:none"><a class="btn line" href="https://smartstore.naver.com/naturetrail_3927" target="_blank" rel="noopener">스마트스토어</a><a class="btn line" href="https://naturetrail.kr" target="_blank" rel="noopener">naturetrail.kr</a></div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">WHY IT MATTERS</p><h2 class="title-ko rv d1">브랜드를 해 본<br>생산 파트너</h2></div><p class="lead rv d2">NATURE TRAIL은 BSF가 런칭한 자체 브랜드입니다. 기획 · 생산 · 판매를 직접 해 보았기에 재고 · 원가 · 출시 일정이 브랜드에 얼마나 중요한지 압니다. 바이어의 오더도 같은 마음으로 만듭니다.</p></div>
      <div class="nt-cats">{''.join(f'<img class="rv d{i}" src="images/brand/bnnsub0{i + 1}.webp" alt="{t}" loading="lazy" width="474" height="573">' for i, t in enumerate(['네이처트레일 상의', '네이처트레일 아우터', '네이처트레일 하의']))}</div>
    </div>
  </section>

  <section class="sec paper2">
    <div class="wrap">
      <div class="sec-head row"><div><p class="eyebrow rv">COLLECTION</p><h2 class="title rv d1">Made by<br><span class="o">ourselves.</span></h2></div><p class="lead rv d2">경량 다운 · 베스트 · 패딩 · 카고 데님 · 조거 팬츠 · 맨투맨 — 모두 BSF의 생산 네트워크에서 만들었습니다.</p></div>
      <div class="nt-grid">{''.join(f'<figure class="rv d{i % 4}"><img src="images/brand/{p}.webp" alt="네이처트레일 제품" loading="lazy" width="700" height="700"></figure>' for i, p in enumerate(NT_SQ))}</div>
    </div>
  </section>

  <section class="brand-band sec">
    <div class="bg" style="background-image:url(images/brand/hike.webp)"></div>
    <div class="wrap"><div class="nt-strip" style="margin-top:0">{''.join(f'<figure><img src="images/brand/{p}.webp" alt="네이처트레일 화보" loading="lazy" width="700" height="1100"></figure>' for p in ['p14', 'p15', 'p06', 'p03', 'p13', 'p04'])}</div></div>
  </section>

  <section class="sec">
    <div class="wrap tm">
      <img class="rv" src="images/brand/trademark.webp" alt="NATURE TRAIL 상표등록증" loading="lazy">
      <div>
        <p class="eyebrow rv">TRADEMARK</p><h2 class="title-ko rv d1">상표 등록</h2>
        <dl class="rv d2" style="margin-top:22px"><div><dt>상표</dt><dd>NATURE TRAIL</dd></div><div><dt>등록번호</dt><dd>제 40-1895781 호</dd></div><div><dt>등록일</dt><dd>2022년 8월 3일</dd></div><div><dt>지정상품</dt><dd>제25류 의류 등 20건</dd></div></dl>
      </div>
    </div>
  </section>
{CTA}
</main>
''' + FOOT
write('brand.html', brand)

# ═════════════ CONTACT ═════════════
PICK = ['아우터 · 자켓', '다운 · 패딩', '티셔츠 · 폴로', '맨투맨 · 후디', '팬츠 · 데님', '원피스 · 스커트', '모자', '양말 · 가방', '원단 · 부자재', '기타']
contact = head('생산 문의 | BSF COMPANY', '품목 · 수량 · 납기를 알려 주시면 맞는 생산지와 원가를 제안드립니다. BSF COMPANY 생산 문의.', 'has-page-hero') + f'''
<main id="main">
{page_hero('images/hero-detail.webp', 'CONTACT', "Let's make <span class=\"o\">it.</span>", '품목 · 수량 · 납기를 알려 주시면, 맞는 생산지와 원가를 제안드립니다.')}

  <section class="sec">
    <div class="wrap contact">
      <div>
        <form class="form rv" id="inquiry" novalidate>
          <fieldset class="f-step"><legend><b>01</b>무엇을 만드시나요?</legend>
            <div class="picks">{''.join(f'<label><input type="checkbox" name="item" value="{p}"><span>{p}</span></label>' for p in PICK)}</div>
          </fieldset>
          <fieldset class="f-step"><legend><b>02</b>수량과 일정</legend>
            <div class="f-grid two">
              <label class="f"><span>예상 수량</span><select name="qty"><option value="">고르세요</option><option>300장 미만</option><option>300 ~ 1,000장</option><option>1,000 ~ 5,000장</option><option>5,000 ~ 20,000장</option><option>20,000장 이상</option><option>아직 미정</option></select></label>
              <label class="f"><span>희망 납기</span><input name="due" type="month" aria-label="희망 납기 (년-월)"></label>
            </div>
            <label class="f" style="margin-top:16px"><span>준비된 것</span><select name="ready"><option value="">고르세요</option><option>아이디어 · 레퍼런스만</option><option>디자인 스케치</option><option>작업지시서(테크팩)</option><option>샘플(실물)</option></select></label>
          </fieldset>
          <fieldset class="f-step"><legend><b>03</b>내용</legend>
            <label class="f"><span>문의 내용</span><textarea name="message" maxlength="2000" placeholder="소재 · 디테일 · 목표 단가 · 참고 브랜드 등 편하게 적어 주세요. 이미지나 작업지시서는 답변 메일로 보내 주시면 됩니다."></textarea></label>
          </fieldset>
          <fieldset class="f-step"><legend><b>04</b>연락받으실 곳</legend>
            <div class="f-grid two">
              <label class="f"><span>회사 · 브랜드명 <i>*</i></span><input name="company" maxlength="80" autocomplete="organization" required></label>
              <label class="f"><span>담당자 <i>*</i></span><input name="name" maxlength="40" autocomplete="name" required></label>
              <label class="f"><span>연락처 <i>*</i></span><input name="contact" maxlength="40" autocomplete="tel" inputmode="tel" placeholder="010-0000-0000" required></label>
              <label class="f"><span>이메일</span><input name="email" type="email" maxlength="80" autocomplete="email" placeholder="name@company.com"></label>
            </div>
          </fieldset>
          <div class="privacy">
            <p>개인정보 수집 · 이용 안내</p>
            <dl><div><dt>수집 항목</dt><dd>회사명 · 담당자 · 연락처 · 이메일</dd></div><div><dt>이용 목적</dt><dd>생산 문의 확인 및 답변</dd></div><div><dt>보관 기간</dt><dd>답변이 끝나면 지체 없이 파기</dd></div></dl>
            <label class="agree"><input type="checkbox" name="agree"><span class="box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span><span>위 내용에 동의합니다 <em>(필수)</em></span></label>
          </div>
          <div class="f-bot"></div>
          <p class="f-err" role="alert"></p>
          <button class="btn solid f-send" type="submit">문의 보내기</button>
        </form>
        <div class="form f-done" id="inquiry-done" hidden>
          <span class="ok" aria-hidden="true">✓</span>
          <h3>문의가 접수되었습니다</h3>
          <p>담당 소싱팀이 확인 후 남겨 주신 연락처로 빠르게 연락드리겠습니다.</p>
          <a class="btn line" href="capability.html">생산역량 둘러보기</a>
        </div>
      </div>
      <aside class="side-info">
        <div class="side-card rv"><h3>BSF COMPANY</h3><dl><div><dt>주소</dt><dd>서울특별시 구로구 디지털로 271<br>벽산디지털밸리 3차 110호</dd></div><div><dt>대표</dt><dd>오은총</dd></div></dl></div>
        <div class="side-card light rv d1"><h3>빠른 답변을 위한 팁</h3><p>품목 · 예상 수량 · 희망 납기 · 목표 단가를 알려 주시면 생산지와 원가를 바로 비교해 드릴 수 있습니다.</p><a class="btn line" href="capability.html#faq">자주 묻는 질문</a></div>
        <iframe class="map-frame rv d2" title="BSF COMPANY 오시는 길 지도" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=%EC%84%9C%EC%9A%B8%20%EA%B5%AC%EB%A1%9C%EA%B5%AC%20%EB%94%94%EC%A7%80%ED%84%B8%EB%A1%9C%20271&z=16&output=embed"></iframe>
      </aside>
    </div>
  </section>
</main>
''' + FOOT
write('contact.html', contact)
