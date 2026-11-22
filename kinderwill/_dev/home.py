"""첫 화면 (2차 디자인: 히어로 로테이션 + 구간마다 다른 짜임)"""
import json
from kit import *

# 히어로 첫 장 = 키즈스텝스마트성장센터(남색 + 라임, 새 사진 k_main · k_main_p — 아직 없으면 k_hero). 간판 글자가 틀리게 나온 사진(kit.held)은 다시 만들어질 때까지 쓰지 않는다
has = lambda n: (ROOT / "images" / f"{n}.webp").exists()
KS_IMG = "k_main" if has("k_main") else "k_hero"; KS_IMG_P = "k_main_p" if has("k_main_p") else ""
ENV_IMG = "c2sensory"                  # 간판이 글자와 겹치지 않는 사진으로(안내데스크 사진 h_env 는 글 뒤에 간판이 온다)
SLIDES = [  # 그림, 대체글, PC 에서 보일 자리, 폰(세로)에서 보일 자리, 작은 줄, 제목, 한 줄, 단추, 주소, 모양 — 글은 현재 홈페이지(kinderwill.com · 키즈스텝) 문구에서
    (KS_IMG, "허들을 뛰어넘는 아이의 뒷모습 — 키즈스텝 스마트성장센터", "70% 50%", "50% 60%", "키즈스텝스마트성장센터",
     "아이의 성장은<br>운동이 아니라<br><em>‘관리’</em>입니다", "아이의 성장을 측정하고, 분석하고, 관리합니다. <span class=\"nb\"><b>Body</b> + <b>Brain</b> + <b>Social</b></span>", "키즈스텝스마트성장센터 자세히", "kidstep", "kst"),
    ("cl_desk", "책상에 둘러앉아 손을 들고 발표하는 아이들과 선생님", "60% 40%", "62% 70%", "Kinder(우리 아이들) + Will(의지와 열정)",
     "우리 아이들이 주도적인<br><em>의지와 열정</em>으로 행복한<br>꿈과 미래를 만들어 가는 곳", "킨더윌은 우리 아이들에게 꼭 필요한 치료만을 권장하며 불필요한 치료를 권하지 않습니다.", "상담 예약하기", "contact", ""),
    ("cl_circle", "선생님과 아이들이 둥글게 앉아 이야기하는 사회성 그룹 수업", "62% 42%", "58% 62%", "킨더윌 사회성센터",
     "킨더윌만의 <em class=\"nb\">사회성 그룹 수업</em>,<br>화용언어 중심의<br>특화된 수업", "작은 변화가 쌓여 아이의 사회성이 크게 자라납니다.", "사회성 프로그램 보기", "social", ""),
    (ENV_IMG, "킨더윌의 치료실", "60% 55%", "50% 75%", "교육 환경",
     "노원구의 전문적인<br><em>교육 환경</em>", "언어 · 인지교실 12개, 놀이 · 미술치료실 5개, 감각통합실 2개, 독립적 공간의 사회성교실 1개, 상담실 4개.", "센터 안내 보기", "centers", ""),
    ("h_team", "낮은 책상에 모여 앉아 선생님의 그림책을 보는 아이들", "70% 40%", "62% 60%", "전문가",
     "<em>30여 명의 전문가</em>가<br>함께하는 맞춤형 프로그램과<br>맞춤형 검사 프로그램", "사회성부터 언어까지 전인적 발달을 위한 맞춤 프로그램을 제공합니다. 올바른 성장의 첫걸음을 함께하세요.", "전문가 소개 보기", "team", ""),
    ("p_counsel", "창가에 의자 두 개가 마주 놓인 상담실", "60% 60%", "40% 78%", "전국민마음투자",
     "킨더윌은 <em class=\"nb\">전국민마음투자</em><br>전문센터를 독립적으로<br>갖추고 있습니다", "유아 · 아동을 위한 심리 프로그램, 청소년 · 성인을 위한 상담 프로그램.", "심리상담 보기", "counsel", ""),
]
SOCIAL = [  # 키, 탭 이름, 나이, 제목, 글, 점검 3, 그림
    ("prag", "화용언어", "6세 ~ 초등", "화용언어 사회성", "상황을 이해하고 그에 맞는 말을 쓰며, 또래 사이에서 필요한 사회적 기술을 기르도록 돕습니다. 말로 하는 화용 기술과 말이 아닌 신호(표정 · 눈맞춤 · 거리)를 함께 배웁니다.",
     ["대화를 시작하고 이어 가기", "차례 지키며 말하기", "친구의 마음에 공감하기"], "cl_card"),
    ("play", "놀이", "5세 ~ 초등", "놀이 사회성", "놀이 속에서 자연스럽게 사회적 기술을 배우고 연습합니다. 서로 주고받으며 놀고, 놀이 안에서 생기는 문제를 함께 풀어 봅니다.",
     ["눈맞춤과 주고받기", "함께하는 협동 놀이", "규칙이 있는 놀이 익히기"], "cl_pair"),
    ("sens", "감각통합", "5세 ~ 초등", "감각통합 사회성", "여러 감각 자극을 더 잘 받아들이고 조절하도록 도와, 그룹 안에서의 참여와 상호작용을 키웁니다.",
     ["몸을 쓰며 함께하는 활동", "차례 · 규칙 지키기", "주의를 모으고 조절하기"], "cl_move"),
    ("gym", "성장체육", "3세 ~ 초등", "성장체육 사회성", "신체 활동과 체육을 통해 협동, 규칙 지키기, 자기 조절과 의사소통을 자연스럽게 배웁니다. 자신감을 키우고 또래와의 긍정적인 상호작용을 돕습니다.",
     ["친구와 어울려 움직이기", "기다리고 교대하기", "몸으로 감정 풀기"], "k_group"),
    ("school", "학교준비", "7세 · 예비 초등", "학교준비 사회성", "학교라는 새 환경에 적응할 수 있도록, 수업 시간의 상호작용 · 주의 집중 · 규칙 지키기를 미리 연습합니다. 7세 하반기에 학교준비반을 시작합니다.",
     ["선생님 · 친구의 말 경청하기", "협력과 팀워크", "갈등을 말로 풀기"], "cl_desk"),
]
WORRY = [  # 키, 부모의 말, 제목, 한 줄, 추천 [(이름, 설명, 파일)]
    ("talk", "말이 늦거나 발음이 부정확해요", "말과 발음이 걱정될 때", "언어 발달 수준을 평가한 뒤, 아이에게 맞는 계획으로 1:1 언어치료를 진행합니다.",
     [("언어치료", "언어발달지연 · 조음(발음) · 유창성(말더듬)", "speech"), ("오감언어 · 말놀이언어", "감각과 놀이로 어휘를 넓히는 학습 프로그램", "alpha")]),
    ("friend", "친구와 어울리기 힘들어해요", "또래 관계가 걱정될 때", "또래와 함께 배우는 그룹 수업으로 다가가기 · 차례 지키기 · 대화 주고받기를 연습합니다.",
     [("사회성 프로그램", "화용언어 · 놀이 · 감각통합 · 성장체육 · 학교준비", "social"), ("놀이치료", "상호작용이 부족하거나 위축된 아이", "play")]),
    ("focus", "산만하고 기다리기 어려워해요", "집중과 조절이 걱정될 때", "감각 처리와 자기 조절, 주의 집중을 돕는 치료를 아이 상태에 맞춰 권합니다.",
     [("감각통합치료", "착석 · 자기 조절 · 협응이 어려운 아이", "sensory"), ("인지치료", "주의 집중이 짧고 과제 수행이 어려운 아이", "cognitive")]),
    ("feel", "감정 조절이 어렵고 불안해해요", "마음이 걱정될 때", "말로 표현하기 어려운 마음을 놀이와 미술로 풀어내며 정서적 안정을 돕습니다.",
     [("놀이치료", "감정 조절 · 불안 · 위축 · 가족 관계", "play"), ("미술치료", "자기표현(감정 표현)이 어려운 아이", "art")]),
    ("school", "학교 갈 준비가 걱정돼요", "입학을 앞두고 있을 때", "학교 생활에 필요한 경청 · 규칙 · 협력을 또래와 함께 미리 연습합니다.",
     [("학교준비 사회성", "7세 하반기 학교준비반 · 초등 학교적응반", "social-programs"), ("인지학습", "한글 · 처리 속도 — 7세 학교 준비반과 초등", "alpha")]),
    ("learn", "한글 · 수 개념이 느려요", "배움의 기초가 걱정될 때", "교구와 놀이로 수 개념 · 기초 인지 · 한글을 다지는 러닝센터 프로그램이 있습니다.",
     [("킨더윌 알파α", "놀이수학 · 인지학습 · 미술언어", "alpha"), ("인지치료", "읽기 · 쓰기 · 셈 등 특정 영역이 어려운 아이", "cognitive")]),
    ("body", "체력 · 자세 · 성장이 궁금해요", "몸의 성장이 궁금할 때", "측정에서 시작해 분석 · 맞춤 프로그램 · 리포트로 이어지는 성장 관리 프로그램입니다.",
     [("키즈스텝 스마트성장센터", "체형 · 체성분 · 체력 · 균형 측정과 맞춤 운동", "kidstep"), ("감각통합치료", "대근육 · 소근육 발달과 협응", "sensory")]),
    ("adult", "청소년 · 성인 상담을 찾아요", "내 마음이 힘들 때", "유아 · 아동부터 청소년 · 성인까지 연령별 상담을 진행하며, 전국민마음투자 지원사업 제공기관입니다.",
     [("심리상담", "우울 · 불안 · 스트레스 · 대인관계 · 진로", "counsel"), ("바우처 안내", "전국민마음투자 — 전문 심리상담 8회 지원", "voucher")]),
]
CARDS = [  # 파일, 그림, 작은 글, 이름, 설명
    ("speech", "c1speech", "1:1 치료", "언어치료", "언어 발달 수준을 평가하고 아이에게 맞는 계획으로 진행합니다. 아동 · 성인 모두 가능합니다."),
    ("play", "c2play", "1:1 치료", "놀이치료", "놀이를 통해 마음 상태를 살피고 정서적 어려움을 풀어 갑니다."),
    ("art", "p_art", "1:1 치료", "미술치료", "미술 매체로 내면의 감정을 표현하도록 돕습니다."),
    ("sensory", "c2sensory", "1:1 치료", "감각통합치료", "감각 처리 · 자기 조절 · 운동과 협응을 키웁니다."),
    ("cognitive", "p_cognitive", "1:1 치료", "인지치료", "이해하고 처리하는 힘, 학습의 기초를 다집니다."),
    ("counsel", "c1counsel", "유아 ~ 성인", "심리상담", "연령별 맞춤 상담. 전국민마음투자 지원사업 제공기관입니다."),
]
REVIEWS = [  # 네이버 방문자 리뷰에서 한 문장씩(이름은 가림)
    ("우리 아이 몇 년째 다니고 있는데 많이 좋아졌어요.", "초**"), ("선생님들 친절하시고 아이들을 사랑하는 마음이 느껴져요.", "ra*"),
    ("상담받고 바로 수업을 시작했는데 아이 언어가 많이 늘었어요.", "Gr*"), ("두 돌 때부터 꾸준히 다니고 있어요. 선생님 정말 실력 있으세요.", "제**"),
    ("낯가리는 아이라 처음엔 시간이 걸렸지만 지금은 잘 다니고 있습니다.", "사**"), ("수업이 다양하게 많아서 좋고, 올 때마다 친절하게 해 주세요.", "sz*"),
]
PRIDE = [  # 그림, 대체글, 분류, 제목, 한 줄
    ("press/ebs7", "EBS 메디컬다큐 7요일 출연 화면 모음", "방송 · 2019", "EBS 메디컬다큐 7요일", "이유진 원장이 인지 · 언어 치료사로 출연했습니다."),
    ("press/kbpa", "2024 KBPA 한국브랜드언론평가 발달재활서비스 분야 우수 상패 그림", "수상 · 2024", "2024 KBPA 한국브랜드언론평가", "발달재활서비스 분야 우수로 선정되었습니다."),
    ("press/ebs0700", "EBS 나눔 0700 출연 화면 모음", "방송 · 2024", "EBS 나눔 0700", "698화 ‘엄마가 끝까지 지켜줄게’에 이유진 원장이 출연했습니다."),
]
NEWS = [  # 그림, 언론사 · 날짜, 제목
    ("press/n-itdonga", "동아일보(IT동아) · 2024. 06. 18", "킨더윌알파 “어린이의 종합적인 성장을 지원합니다”"),
    ("press/n-moa", "강소기업뉴스 · 2023. 07. 26", "“건강한 가정을 세우는 모아비전행복연구소 설립”"),
    ("press/n-naewoe", "내외경제TV · 2020. 11. 20", "“주의집중훈련 · 독서테라피 등 학습 프로그램 선보일 예정”"),
    ("press/n-sisun", "시선뉴스 · 2019. 01. 22", "킨더윌 언어 · 심리전문센터 이유진 원장 인터뷰"),
]

def home():
    try: blog = json.loads((ROOT / "_dev" / "blog.json").read_text(encoding="utf-8"))[:4]
    except Exception: blog = []
    A = ic("arr"); N = len(SLIDES)

    # ── 히어로: 사진과 글이 함께 바뀐다. 첫 장만 바로 받고 나머지는 화면이 뜬 뒤(site.js)
    bgs, txs = [], []
    for i, (im, alt, pos, posm, eb, h, line, bt, to, kind) in enumerate(SLIDES):
        st = f' style="--pos:{pos};--posm:{posm}"'; k = f" {kind}" if kind else ""
        if i == 0:
            src = f'<source media="(max-width: 899px) and (orientation: portrait)" srcset="images/{KS_IMG_P}.webp?v={V}">' if KS_IMG_P else ""
            pic = f'<picture>{src}{img(im, alt, lazy=False, extra=' fetchpriority="high"')}</picture>'
        else:
            w, hh = SIZES.get(im + ".webp", (0, 0))
            pic = f'<img data-src="images/{im}.webp?v={V}" alt="{e(alt)}"{f" width=\"{w}\" height=\"{hh}\"" if w else ""} decoding="async">'
        bgs.append(f'<div class="hb{k}{" on" if i == 0 else ""}"{st}>{pic}</div>')
        tag = "h1" if i == 0 else "p"
        ebh = (f'<p class="hero-eb"><span class="hero-kslogo">{img("ks/logo-kidstep.webp", "KIDSTEP Smart Growth Center", lazy=False)}</span>{eb}</p>' if kind == "kst" else f'<p class="hero-eb">{eb}</p>')
        txs.append(f'<div class="ht{k}{" on" if i == 0 else ""}" data-slide="{i}"{"" if i == 0 else " aria-hidden=\"true\""}>{ebh}<{tag} class="hero-h">{h}</{tag}>'
                   f'<p class="hero-p">{line}</p><div class="hero-act">{btn(bt, href(to), "btn-lime" if kind == "kst" else "btn-white")}</div></div>')
    hero = (f'<section class="hero" data-hero aria-roledescription="슬라이드" aria-label="킨더윌 · 키즈스텝 소개"><div class="hero-bgs">{"".join(bgs)}</div>'
            f'<div class="wrap hero-in"><div class="hero-txs">{"".join(txs)}</div>'
            f'<div class="hero-ui"><span class="hero-n" aria-live="polite"><b>01</b><i>/</i>{N:02d}</span><span class="hero-bar" aria-hidden="true"><i></i></span>'
            f'<button type="button" class="hero-prev" aria-label="이전 장">{ic("prev")}</button><button type="button" class="hero-pause" aria-label="자동 넘김 멈춤" aria-pressed="false">{ic("pause")}{ic("play")}</button>'
            f'<button type="button" class="hero-next" aria-label="다음 장">{ic("next")}</button></div></div></section>\n')

    q = [("guide", "처음 오시는 분", "상담부터 수업까지"), ("social", "사회성 프로그램", "또래와 배우는 수업"), ("speech", "치료 · 상담", "언어 · 심리 · 감각통합"),
         ("voucher", "바우처 안내", "지원 대상과 신청 방법"), ("centers", "센터 찾기", "가까운 센터 · 오시는 길")]
    quick = '<nav class="quick" aria-label="빠른 메뉴"><div class="wrap"><ul>' + "".join(f'<li><a href="{href(f)}"><span>{d}</span><b>{t}</b>{A}</a></li>' for f, t, d in q) + "</ul></div></nav>\n"

    # ── 고민으로 찾기: 왼쪽 부모의 말(줄 목록) · 오른쪽 안내
    wl = "".join(f'<button type="button" data-pick="worry" data-key="{k}" aria-pressed="{"true" if n == 0 else "false"}"{" class=\"on\"" if n == 0 else ""}><i>{n + 1:02d}</i><span>{say}</span>{A}</button>' for n, (k, say, *_ ) in enumerate(WORRY))
    wp = "".join(f'<div class="pane{" on" if n == 0 else ""}" data-pane-of="worry" data-pane="{k}"><h3>{t}</h3><p>{d}</p><div class="worry-recs">'
                 + "".join(f'<a href="{href(f)}"><b>{nm}</b><span>{ds}</span>{A}</a>' for nm, ds, f in recs) + "</div></div>" for n, (k, say, t, d, recs) in enumerate(WORRY))
    worry = sec('<div class="worry"><div class="worry-l">'
                + head("고민으로 찾기", "어떤 점이<br><em>걱정</em>되시나요?", "가장 가까운 고민을 고르면 맞는 프로그램을 안내해 드립니다. 정확한 방향은 초기 상담과 평가 뒤에 함께 정합니다.", kind="stack")
                + f'<div class="worry-list rv">{wl}</div></div>'
                + f'<div class="worry-out rv"><p class="worry-cap">이런 프로그램을 권합니다</p>{wp}<div class="worry-foot"><p>어느 쪽인지 잘 모르겠다면 그대로 문의해 주세요. 상담에서 함께 살펴봅니다.</p>{btn("상담 문의하기", href("contact"), "btn-ink btn-sm")}</div></div></div>', id="worry")

    # ── 사회성 프로그램(대표): 실제 수업 사진 + 탭
    tabs = '<div class="seg coral rv" data-tabs="soc" role="tablist" aria-label="사회성 프로그램">' + "".join(f'<button type="button" role="tab" data-tab="{k}" data-text="{age}" aria-selected="{"true" if n == 0 else "false"}"{" class=\"on\"" if n == 0 else ""}>{tab}</button>' for n, (k, tab, age, *_ ) in enumerate(SOCIAL)) + "</div>"
    def simg(n, k, im):
        w, h = SIZES.get(im + ".webp", (1000, 667))
        return f'<img {"src" if n == 0 else "data-src"}="images/{im}.webp?v={V}" alt="" width="{w}" height="{h}" data-img-of="soc" data-img="{k}"{" class=\"on\"" if n == 0 else ""} loading="lazy" decoding="async">'
    imgs = "".join(simg(n, k, im) for n, (k, _, _, _, _, _, im) in enumerate(SOCIAL))
    panes = "".join(f'<div class="pane{" on" if n == 0 else ""}" data-pane-of="soc" data-pane="{k}"><h3>{t}</h3><p>{d}</p>{ticks(tk)}</div>' for n, (k, _, _, t, d, tk, _) in enumerate(SOCIAL))
    strip = [("cl_circle", "둥글게 앉아 이야기 나누기"), ("cl_sit", "그림책을 함께 보는 시간"), ("cl_line", "줄을 서서 차례 기다리기"), ("cl_work", "책상에 앉아 함께하는 활동")]
    social = (f'<section class="sec soc"><div class="wrap">{chapter("01", "킨더윌 사회성센터 · 사회성 프로그램")}'
              + head("", "킨더윌만의<br><em>사회성 그룹 수업</em>", "화용언어 중심의 특화된 수업. 화용언어를 중심으로 놀이 · 감각통합 · 체육 · 학교준비까지, 공감 능력과 소통 기술 · 자기 조절 · 협동심을 키우는 그룹 수업입니다.",
                     act=btn("사회성 프로그램 전체 보기", href("social"), "btn-line"), kind="big")
              + f'<div class="feat"><figure class="feat-img rv">{imgs}<span class="feat-age"><small>대상</small><b data-text-of="soc">{SOCIAL[0][2]}</b></span></figure>'
              f'<div class="feat-tx rv">{tabs}{panes}<div class="feat-act">{btn("프로그램별 안내", href("social-programs"), "btn-ink")}{btn("수업 문의", href("contact"), "btn-line", arrow=False)}</div></div></div>'
              + '<ul class="soc-strip rv" aria-label="사회성 그룹 수업 사진">' + "".join(f'<li>{img(n, c)}<span>{c}</span></li>' for n, c in strip) + "</ul></div></section>\n")

    # ── 치료 · 상담: 카드 대신 줄 목록(올리면 왼쪽 사진이 바뀐다)
    def timg(n, f, im):
        w, h = SIZES.get(im + ".webp", (1000, 667))
        return f'<img {"src" if n == 0 else "data-src"}="images/{im}.webp?v={V}" alt="" width="{w}" height="{h}" data-img-of="thx" data-img="{f}"{" class=\"on\"" if n == 0 else ""} loading="lazy" decoding="async">'
    tl = "".join(f'<li><a href="{href(f)}" data-hover="thx" data-key="{f}"{" class=\"on\"" if n == 0 else ""}><i>{n + 1:02d}</i><b>{t}</b><span>{d}</span><small>{sm}</small><em>{img(im, "")}</em>{A}</a></li>' for n, (f, im, sm, t, d) in enumerate(CARDS))
    therapy = (f'<section class="sec sec-soft thx"><div class="wrap thx-in"><div class="thx-l">{chapter("02", "치료 · 상담")}'
               + head("", "아이에게 <em class=\"nb\">꼭 필요한</em><br>치료만을 권장합니다", "킨더윌은 불필요한 치료를 권하지 않습니다. 초기 상담과 평가로 아이의 상태를 살핀 뒤 치료가 필요한지부터 함께 정합니다. 1:1 수업 40분 뒤에는 매번 보호자 상담 10분이 이어집니다.", kind="stack")
               + '<figure class="thx-img rv">' + "".join(timg(n, f, im) for n, (f, im, *_ ) in enumerate(CARDS)) + '</figure></div>'
               + f'<ol class="thx-list rv">{tl}</ol></div></section>\n')

    # ── 학습 프로그램: 사진이 화면 끝까지
    alpha_names = ["오감언어", "미술언어", "말놀이언어", "놀이수학", "인지학습", "사회성수업"]
    alpha = (f'<section class="abn"><div class="abn-img rv">{img("p_alpha", "교구로 수 개념을 익히는 학습 수업")}<span>4센터 · 러닝센터</span></div>'
             f'<div class="abn-tx">{chapter("03", "학습 프로그램 · 킨더윌 알파α")}<h2 class="rv">아동 발달 학습의<br><em>첫 단계</em>, 킨더윌 알파α</h2>'
             f'<p class="rv">러닝센터(킨더윌 4센터)에서 다양한 감각적 자극을 통해 배웁니다. 개별 수업 · 짝 수업 · 소그룹 수업으로 진행합니다.</p>'
             '<ol class="abn-list rv">' + "".join(f"<li>{x}</li>" for x in alpha_names) + f'</ol><div class="about-act rv">{btn("학습 프로그램 보기", href("alpha"), "btn-ink")}</div></div></section>\n')

    # ── 키즈스텝(짙은 남색 면)
    flow = [("측정", "체형 · 체성분 · 체력 · 균형 · 발바닥 아치 · 성장"), ("분석", "측정 결과로 지금의 상태를 읽습니다"), ("맞춤 프로그램", "성장 운동 · 두뇌 · 사회성 발달"), ("성장 관리", "다시 재고, 변화를 살핍니다"), ("성장 리포트", "전후를 비교해 보호자와 나눕니다")]
    ks = (f'<section class="ks sec"><div class="wrap"><div class="ks-top"><figure class="ks-img rv">{img("k_balance", "평균대 위를 걷는 아이의 발")}'
          f'<span class="ks-logo">{img("ks/logo-kidstep.webp", "키즈스텝 스마트성장센터 로고")}</span></figure>'
          f'<div class="ks-tx rv"><span class="eb">키즈스텝 스마트성장센터</span>'
          f'<h2>아이의 성장은 운동이 아니라<br><em>‘관리’</em>입니다</h2><p>키즈스텝 스마트성장센터는 아이의 성장을 측정하고, 분석하고, 관리합니다. 신체 활동에 두뇌 발달과 사회성 발달을 더한 통합 성장 프로그램입니다.</p>'
          f'<ul class="ks-3"><li><b>Body</b>신체 활동</li><li><b>Brain</b>두뇌 발달</li><li><b>Social</b>사회성 발달</li></ul>'
          f'<div class="ks-act">{btn("키즈스텝 자세히 보기", href("kidstep"), "btn-lime")}<a class="btn btn-glass" href="tel:029363421">{ic("tel")}02-936-3421</a></div></div></div>'
          '<ol class="flow rv">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in flow) + f'</ol><p class="swipe-tip">{ic("arr")}옆으로 넘겨 5단계를 보세요</p></div></section>\n')

    # ── 센터 찾기 + 공간 사진 띠
    tour = [("hero-p" if held("c3desk") else "c3desk", "3센터 안내데스크"), ("c2sensory", "2센터 감각통합치료실"), ("c1counsel", "1센터 상담실"), ("c3social", "3센터 사회성 교실"), ("c2desk", "2센터 입구"), ("c4hall", "4센터 러닝센터"), ("c2play", "2센터 놀이치료실"), ("c3wait", "3센터 대기실"), ("c1speech", "1센터 언어치료실"), ("c2wait", "2센터 대기실")]
    strip2 = '<div class="tour" aria-label="센터 공간 사진"><ul>' + "".join(f'<li{" aria-hidden=\"true\"" if k else ""}>{img(n, "" if k else t)}<span>{t}</span></li>' for k in (0, 1) for n, t in tour) + "</ul></div>"
    b0 = BRANCHES[1]
    brs = "".join(f'<button type="button" class="br{" on" if b["key"] == "c2" else ""}" data-pick="branch" data-key="{b["key"]}" data-name="{b["name"]}" data-addr="{b["addr"]}" data-addr-full="{b["addr"]} {b["addr2"]}" data-tel="{b["tel"]}" aria-pressed="{"true" if b["key"] == "c2" else "false"}">'
                  f'<i>{b["short"]}</i><b>{b["name"]}</b><span>{b["does"]}</span><em>{b["addr"]} <span class="nb">{b["addr2"]}</span></em></button>' for b in BRANCHES)
    branch = ('<section class="sec loc"><div class="wrap">' + chapter("04", "교육 환경 · 센터 찾기")
              + head("", "전문적인 <em>교육 환경</em>,<br>노원 상계동 1 ~ 4센터", "언어 · 인지교실 12개, 놀이 · 미술치료실 5개, 감각통합실 2개, 사회성교실 1개, 상담실 4개. 센터마다 하는 일이 조금씩 다릅니다. 어느 센터로 가야 할지는 상담 때 안내해 드립니다.", act=btn("센터 안내 · 오시는 길", href("centers"), "btn-line"))
              + "</div>" + strip2 + f'<div class="wrap"><div class="branch"><div class="br-list rv">{brs}</div><div class="br-map rv"><iframe data-map data-addr="{b0["addr"]}" data-name="{b0["name"]}" title="센터 위치 지도" loading="lazy"></iframe>'
              f'<div class="br-info"><p>{b0["name"]}<small>{b0["addr"]} {b0["addr2"]}</small></p><div><a class="btn btn-sm btn-line br-tel" href="tel:{b0["tel"].replace("-", "")}">{ic("tel")}<span>{b0["tel"]}</span></a>'
              f'<a class="btn btn-sm btn-ink br-go" href="https://map.naver.com/p/search/{b0["addr"]}" target="_blank" rel="noopener">길찾기</a></div></div></div></div></div></section>\n')

    # ── 처음 오시는 분: 큰 번호 3단계 + 바우처(청록 면)
    start = sec(head("처음 오시는 분", "올바른 성장의 <em>첫걸음</em>을<br>함께하세요", "상담부터 수업까지, 이렇게 진행됩니다.", act=btn("이용 절차 자세히", href("guide"), "btn-line"), kind="line")
                + '<div class="start"><ol class="st-steps rv"><li><b>예약 · 초기 상담</b><span>전화로 예약하고, 아이의 발달 상태와 걱정되는 점을 나눕니다.</span><em>전화 · 카카오톡 · 네이버 예약</em></li><li><b>평가 · 결과 상담</b><span>아이의 상태를 다각도로 살핀 뒤 치료가 필요한지, 어떤 계획이 맞는지 함께 정합니다.</span><em>필요한 치료만 권합니다</em></li>'
                  '<li><b>수업 · 보호자 상담</b><span>수업 뒤에는 매번 보호자 상담이 이어지고, 회기마다 목표를 점검합니다.</span><em>수업 40분 + 상담 10분</em></li></ol>'
                  f'<div class="vbox rv"><h3>정부 바우처로<br>이용할 수 있습니다</h3><p>킨더윌은 아래 바우처의 제공기관입니다. 대상과 신청 방법을 확인해 보세요.</p><ul><li>발달재활</li><li>영유아 발달지원</li><li>아동청소년 심리지원</li><li>교육청(굳센카드)</li><li>전국민마음투자</li></ul>{btn("바우처 안내 보기", href("voucher"), "")}</div></div>', soft=True)

    # ── 쉬어 가는 장면 + 사람: 원장의 말(크게) + 선생님들의 한마디(전문가 소개에 실린 실제 문장 — 지어내지 않는다)
    scene1 = scene("cl_pair", "“늦게 피는 꽃은 있어도<br>피지 않는 꽃은 없습니다.”", by="윤*지 선생님", role="언어치료 · 2급 언어재활사", alt="귓속말을 나누는 두 아이의 뒷모습", pos="70% 62%")
    about = ('<section class="sec abt"><div class="wrap"><div class="about">'
             f'<figure class="about-img rv">{img("director", "이유진 대표원장")}<figcaption><b>이유진 대표원장</b><span>1급 언어재활사 · 언어치료학 석사</span></figcaption></figure>'
             '<div class="about-tx"><span class="eb rv">우리의 약속 · 원장 이유진</span>'
             '<h2 class="rv">“어머님들이 <em>함박웃음</em>을<br>지으실 그날까지, 아이들과 함께<br>최선을 다하겠습니다.”</h2>'
             '<p class="rv">아이들 한 명 한 명을 위한 맞춤형 통합치료로, 진정성 있는 치료를 약속드립니다. 병원의 재활의학과와 신경정신과(학습클리닉), 여러 기관의 언어치료사로 쌓은 경험과 노하우를 바탕으로, 통합적 접근 방식을 통해 우리 아이들의 잠재력을 끌어올리고자 킨더윌을 설립하게 되었습니다.</p>'
             f'<div class="about-act rv">{btn("인사말 보기", href("about"), "btn-ink")}{btn("걸어온 길", href("history"), "btn-line")}</div></div></div></div></section>\n')
    vo = sec(head("전문가 소개 · 선생님들의 한마디", "30여 명의 전문가가 <em>함께</em>합니다", "언어 · 심리 · 감각통합 · 인지 분야의 선생님들이 전문가 소개에 직접 적은 말입니다.", center=True)
             + voices([("아이들의 속도를 존중하며 곁에서 함께하겠습니다.", "윤*은 선생님", "감각통합치료사", "team/t11"),
                       ("언제나 아이들에게 귀를 기울이고 함께 하며 따라가도록 하겠습니다.", "김*연 선생님", "임상심리사 · 놀이치료사", "team/t04"),
                       ("반짝반짝 빛나는 소중한 아이들의 배움과 성장을 위해 함께하겠습니다.", "임*솜 선생님", "2급 언어재활사", "team/t22")], more_to=href("team"), more_text="분야별 선생님 모두 만나기"), tone="peach", cls="vo")

    # ── 자랑: 방송 · 수상 · 기사(실제 사진) — 누르면 걸어온 길의 언론 구간으로
    press_to = href("history") + "#press"
    pp = "".join(f'<a class="pp pp{n + 1} rv" href="{press_to}"><span class="pp-i">{img(im, alt)}</span><span class="pp-t"><small>{cat}</small><b>{t}</b><span>{d}</span></span></a>' for n, (im, alt, cat, t, d) in enumerate(PRIDE))
    nw = "".join(f'<li><a href="{press_to}"><span class="nw-i">{img(im, "")}</span><small>{src}</small><b>{t}</b></a></li>' for im, src, t in NEWS)
    pride = ('<section class="sec pride" id="pride"><div class="wrap">'
             + head("킨더윌 언론 속 이야기", "킨더윌의 이야기가<br>만들어 가는 <em>변화</em>", "EBS 방송 출연과 수상, 언론 보도를 모았습니다.", act=btn("언론 · 방송 모두 보기", press_to, "btn-line"))
             + f'<div class="pride-top">{pp}</div><ul class="pride-news rv">{nw}</ul>'
             + nums([("2016", "년", "언어심리센터로 개원"), ("30", "여 명", "분야별 전문가"), ("12", "실", "언어 · 인지 교실"), ("1~4", "센터", "노원 상계동")]) + '</div></section>\n')

    # ── 리뷰: 큰 한 문장 + 줄 목록
    r0, rest = REVIEWS[0], REVIEWS[1:]
    rv = sec('<div class="rvs"><div class="rvs-l">' + head("네이버 방문자 리뷰", "부모님들이<br>남겨 주신 <em>이야기</em>", "", kind="stack")
             + f'<blockquote class="rvs-big rv"><p>{r0[0]}</p><footer>{r0[1]} 님 · 네이버 방문자 리뷰</footer></blockquote>'
             + f'<a class="btn btn-line rv" href="{NREVIEW}" target="_blank" rel="noopener">네이버에서 리뷰 전체 보기{ic("ext")}</a></div>'
             + '<ul class="rvw">' + "".join(f'<li class="rv"><q>{t}</q><cite>{n} 님 · 네이버 방문자 리뷰</cite></li>' for t, n in rest) + '</ul></div>'
             + '<p class="rvw-foot rv">네이버 플레이스(킨더윌사회성언어전문센터 2센터)에 남겨 주신 방문자 리뷰 가운데 일부를 한 문장씩 옮겼습니다.</p>')

    # ── 블로그: 첫 글 크게 + 나머지는 줄
    bl = ""
    if blog:
        def bcard(b, big=False):
            pic = img("blog/" + b["img"], "") if b.get("img") else '<span>KINDER WILL</span>'
            return (f'<a class="bl rv{" big" if big else ""}{"" if b.get("img") else " noimg"}" href="{e(b["link"])}" target="_blank" rel="noopener"><div class="bl-img">{pic}</div>'
                    f'<div class="bl-b"><small>{e(b["cat"].split(":")[-1])}</small><b>{e(b["title"])}</b><time datetime="{b["date"]}">{b["date"].replace("-", ". ")}</time></div></a>')
        bl = sec(head("킨더윌 이야기", "블로그에서 전하는 <em>수업 이야기</em>", "수업 장면과 발달 정보를 블로그에 꾸준히 올리고 있습니다.", act=btn("블로그 소식 더 보기", href("news"), "btn-line"))
                 + f'<div class="blog home-blog">{bcard(blog[0], True)}<div class="blog-rest">{"".join(bcard(b) for b in blog[1:])}</div></div>', soft=True)

    body = hero + quick + '<main id="main">\n' + worry + social + therapy + alpha + ks + scene1 + about + vo + branch + pride + rv + start + bl +"</main>\n" + cta_band()
    pre = (f'<link rel="preload" as="image" href="images/{KS_IMG}.webp?v={V}"{" media=\"(min-width: 900px), (orientation: landscape)\"" if KS_IMG_P else ""} fetchpriority="high">\n'
           + (f'<link rel="preload" as="image" href="images/{KS_IMG_P}.webp?v={V}" media="(max-width: 899px) and (orientation: portrait)" fetchpriority="high">\n' if KS_IMG_P else ""))
    return doc("index", SITE, "서울 노원구 상계동 킨더윌 사회성언어전문센터 — 사회성 그룹 프로그램, 언어 · 놀이 · 미술 · 감각통합 · 인지 치료, 심리상담, 학습 프로그램, 키즈스텝 스마트성장센터. 발달재활 · 지역사회서비스 · 교육청 바우처 제공기관.", body, body_cls="home", preload=pre)
