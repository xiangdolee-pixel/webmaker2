"""첫 화면"""
import json
from kit import *

SOCIAL = [  # 키, 탭 이름, 나이, 제목, 글, 점검 3
    ("prag", "화용언어", "6세 ~ 초등", "화용언어 사회성", "상황을 이해하고 그에 맞는 말을 쓰며, 또래 사이에서 필요한 사회적 기술을 기르도록 돕습니다. 말로 하는 화용 기술과 말이 아닌 신호(표정 · 눈맞춤 · 거리)를 함께 배웁니다.",
     ["대화를 시작하고 이어 가기", "차례 지키며 말하기", "친구의 마음에 공감하기"], "p_social"),
    ("play", "놀이", "5세 ~ 초등", "놀이 사회성", "놀이 속에서 자연스럽게 사회적 기술을 배우고 연습합니다. 서로 주고받으며 놀고, 놀이 안에서 생기는 문제를 함께 풀어 봅니다.",
     ["눈맞춤과 주고받기", "함께하는 협동 놀이", "규칙이 있는 놀이 익히기"], "p_social2"),
    ("sens", "감각통합", "5세 ~ 초등", "감각통합 사회성", "여러 감각 자극을 더 잘 받아들이고 조절하도록 도와, 그룹 안에서의 참여와 상호작용을 키웁니다.",
     ["몸을 쓰며 함께하는 활동", "차례 · 규칙 지키기", "주의를 모으고 조절하기"], "p_sensory"),
    ("gym", "성장체육", "3세 ~ 초등", "성장체육 사회성", "신체 활동과 체육을 통해 협동, 규칙 지키기, 자기 조절과 의사소통을 자연스럽게 배웁니다. 자신감을 키우고 또래와의 긍정적인 상호작용을 돕습니다.",
     ["친구와 어울려 움직이기", "기다리고 교대하기", "몸으로 감정 풀기"], "k_group"),
    ("school", "학교준비", "7세 · 예비 초등", "학교준비 사회성", "학교라는 새 환경에 적응할 수 있도록, 수업 시간의 상호작용 · 주의 집중 · 규칙 지키기를 미리 연습합니다. 7세 하반기에 학교준비반을 시작합니다.",
     ["선생님 · 친구의 말 경청하기", "협력과 팀워크", "갈등을 말로 풀기"], "p_school"),
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
CARDS = [
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

def card(f, im, sm, t, d):
    return f'<a class="pc rv" href="{href(f)}"><div class="pc-img">{img(im, "")}</div><div class="pc-b"><small>{sm}</small><h3>{t}</h3><p>{d}</p>{more()}</div></a>'

def home():
    try: blog = json.loads((ROOT / "_dev" / "blog.json").read_text(encoding="utf-8"))[:4]
    except Exception: blog = []
    A = ic("arr")
    hero = f'''<section class="hero">
  <div class="hero-bg"><picture><source media="(max-width: 899px) and (orientation: portrait)" srcset="images/hero-p.webp?v={V}">{img("hero", "킨더윌 사회성언어전문센터 안내데스크와 치료실 복도", lazy=False, extra=' fetchpriority="high"')}</picture></div>
  <div class="wrap"><div class="hero-tx">
    <p class="hero-eb"><i></i>서울 노원 · 사회성 · 언어 발달 전문</p>
    <h1>아이의 <em>말</em>과 <em>마음</em>,<br>그리고 <em>친구 사이</em>까지<br>함께 자랍니다</h1>
    <p class="hero-p">킨더윌은 평가에서 시작해 아이에게 꼭 필요한 치료와 수업만 권합니다. <span class="hero-p2">언어 · 심리 · 감각통합 · 인지 전문가가 한 팀으로 아이의 발달을 돕습니다.</span></p>
    <div class="hero-act">{btn("상담 예약하기", href("contact"))}<a class="btn btn-glass" href="#worry">우리 아이에게 맞는 프로그램</a></div>
    <ul class="hero-facts"><li>2016년 개원</li><li>전문가 30여 명</li><li>노원 상계동 1 ~ 4센터</li><li>정부 바우처 제공기관</li></ul>
  </div></div>
</section>
'''
    q = [("guide", "flag", "처음 오시는 분", "상담부터 수업까지"), ("social", "users", "사회성 프로그램", "또래와 배우는 수업"), ("speech", "talk", "치료 · 상담", "언어 · 심리 · 감각통합"),
         ("voucher", "card", "바우처 안내", "지원 대상과 신청 방법"), ("centers", "pin", "센터 찾기", "가까운 센터 · 오시는 길")]
    quick = '<div class="quick"><div class="wrap"><ul>' + "".join(f'<li><a href="{href(f)}"><i>{ic(i)}</i><b>{t}</b><span>{d}</span></a></li>' for f, i, t, d in q) + "</ul></div></div>\n"

    wl = "".join(f'<button type="button" data-pick="worry" data-key="{k}" aria-pressed="{"true" if n == 0 else "false"}"{" class=\"on\"" if n == 0 else ""}>{say}{A}</button>' for n, (k, say, *_ ) in enumerate(WORRY))
    wp = "".join(f'<div class="pane{" on" if n == 0 else ""}" data-pane-of="worry" data-pane="{k}"><p class="pane-tag"><span class="tag coral">{say}</span></p><h3>{t}</h3><p>{d}</p><div class="worry-recs">'
                 + "".join(f'<a href="{href(f)}"><b>{nm}</b><span>{ds}</span>{A}</a>' for nm, ds, f in recs) + "</div></div>" for n, (k, say, t, d, recs) in enumerate(WORRY))
    worry = sec(head("고민으로 찾기", "어떤 점이 <em>걱정</em>되시나요?", "가장 가까운 고민을 고르면 맞는 프로그램을 안내해 드립니다. 정확한 방향은 초기 상담과 평가 뒤에 함께 정합니다.")
                + f'<div class="worry"><div class="worry-list rv">{wl}</div><div class="worry-out rv">{wp}<div class="worry-foot"><p>어느 쪽인지 잘 모르겠다면 그대로 문의해 주세요. 상담에서 함께 살펴봅니다.</p>{btn("상담 문의하기", href("contact"), "btn-ink btn-sm")}</div></div></div>', id="worry")

    tabs = '<div class="seg coral rv" data-tabs="soc" role="tablist" aria-label="사회성 프로그램">' + "".join(f'<button type="button" role="tab" data-tab="{k}" data-text="{age}" aria-selected="{"true" if n == 0 else "false"}"{" class=\"on\"" if n == 0 else ""}>{tab}</button>' for n, (k, tab, age, *_ ) in enumerate(SOCIAL)) + "</div>"
    imgs = "".join(f'<img {"src" if n == 0 else "data-src"}="images/{im}.webp?v={V}" alt="" width="1280" height="720" data-img-of="soc" data-img="{k}"{" class=\"on\"" if n == 0 else ""} loading="lazy" decoding="async">' for n, (k, _, _, _, _, _, im) in enumerate(SOCIAL))
    panes = "".join(f'<div class="pane{" on" if n == 0 else ""}" data-pane-of="soc" data-pane="{k}"><h3><small>SOCIAL SKILL PROGRAM</small>{t}</h3><p>{d}</p>{ticks(tk)}</div>' for n, (k, _, _, t, d, tk, _) in enumerate(SOCIAL))
    social = sec(head("킨더윌의 대표 프로그램", "또래와 함께 배우는 <em>사회성 프로그램</em>", "화용언어를 중심으로 놀이 · 감각통합 · 체육 · 학교준비까지, 공감 능력과 소통 기술 · 자기 조절 · 협동심을 키우는 그룹 수업입니다.",
                      act=btn("사회성 프로그램 전체 보기", href("social"), "btn-line"))
                 + tabs + f'<div class="feat"><figure class="feat-img rv">{imgs}<span class="feat-age" data-text-of="soc">{SOCIAL[0][2]}</span></figure><div class="feat-tx rv">{panes}'
                 f'<div class="feat-act">{btn("프로그램별 안내", href("social-programs"), "btn-ink")}{btn("수업 문의", href("contact"), "btn-line", arrow=False)}</div></div></div>', soft=True)

    cards = sec(head("치료 · 상담", "아이에게 <em class=\"nb\">꼭 필요한 치료</em>만 권합니다", "초기 상담과 평가로 아이의 상태를 살핀 뒤 치료가 필요한지부터 함께 정합니다. 1:1 수업 40분 뒤에는 매번 보호자 상담 10분이 이어집니다.")
                + '<div class="cards-top">' + "".join(card(*c) for c in CARDS[:2]) + '</div><div class="cards c4">' + "".join(card(*c) for c in CARDS[2:]) + "</div>"
                + f'<div class="two wide-r alpha-row rv">{shot("p_alpha", "교구로 수 개념을 익히는 학습 수업")}<div><span class="eb teal">러닝센터 · 킨더윌 알파α</span><h3>감각과 놀이로 다지는 배움의 첫 단계</h3>'
                  f'<p>개별 수업 · 짝 수업 · 소그룹 수업으로 진행하는 학습 프로그램입니다. 치료와 함께하면 더 좋습니다.</p>'
                  f'<div class="badges">' + "".join(f'<span class="tag">{x}</span>' for x in ["오감언어", "미술언어", "말놀이언어", "놀이수학", "인지학습", "사회성수업"]) + f'</div><div class="about-act">{btn("학습 프로그램 보기", href("alpha"), "btn-line")}</div></div></div>')

    flow = [("측정", "체형 · 체성분 · 체력 · 균형 · 발바닥 아치 · 성장"), ("분석", "측정 결과로 지금의 상태를 읽습니다"), ("맞춤 프로그램", "성장 운동 · 두뇌 · 사회성 발달"), ("성장 관리", "다시 재고, 변화를 살핍니다"), ("성장 리포트", "전후를 비교해 보호자와 나눕니다")]
    ks = (f'<section class="ks sec"><div class="wrap"><div class="ks-top"><div class="rv"><span class="eb">KIDSTEP SMART GROWTH CENTER</span>'
          f'<h2>아이의 성장은 운동이 아니라<br><em>‘관리’</em>입니다</h2><p>키즈스텝 스마트성장센터는 아이의 성장을 측정하고, 분석하고, 관리합니다. 신체 활동에 두뇌 발달과 사회성 발달을 더한 통합 성장 프로그램입니다.</p>'
          f'<ul class="ks-3"><li><b>Body</b>신체 활동</li><li><b>Brain</b>두뇌 발달</li><li><b>Social</b>사회성 발달</li></ul></div>'
          f'<figure class="ks-img rv">{img("k_hero", "콘과 사다리를 따라 달리는 아이들의 뒷모습")}</figure></div>'
          '<ol class="flow rv">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in flow) + f'</ol><p class="swipe-tip">{ic("arr")}옆으로 넘겨 5단계를 보세요</p>'
          f'<div class="ks-act rv">{btn("키즈스텝 자세히 보기", href("kidstep"), "btn-lime")}<a class="btn btn-glass" href="tel:029363421">{ic("tel")}02-936-3421</a></div></div></section>\n')

    tour = [("c3desk", "3센터 안내데스크"), ("c2sensory", "2센터 감각통합치료실"), ("c1counsel", "1센터 상담실"), ("c3social", "3센터 사회성 교실"), ("c2desk", "2센터 입구"), ("c4hall", "4센터 러닝센터"), ("c2play", "2센터 놀이치료실"), ("c3wait", "3센터 대기실"), ("c1speech", "1센터 언어치료실"), ("c2wait", "2센터 대기실")]
    strip = '<div class="tour rv" aria-label="센터 공간 사진"><ul>' + "".join(f'<li{" aria-hidden=\"true\"" if k else ""}>{img(n, "" if k else t)}<span>{t}</span></li>' for k in (0, 1) for n, t in tour) + "</ul></div>"
    b0 = BRANCHES[1]
    brs = "".join(f'<button type="button" class="br{" on" if b["key"] == "c2" else ""}" data-pick="branch" data-key="{b["key"]}" data-name="{b["name"]}" data-addr="{b["addr"]}" data-addr-full="{b["addr"]} {b["addr2"]}" data-tel="{b["tel"]}" aria-pressed="{"true" if b["key"] == "c2" else "false"}">'
                  f'<i>{b["short"]}</i><b>{b["name"]}</b><span>{b["does"]}</span><em>{b["addr"]} <span class="nb">{b["addr2"]}</span></em></button>' for b in BRANCHES)
    branch = sec(head("센터 찾기", "노원 상계동, <em>가까운 킨더윌</em>로 오세요", "센터마다 하는 일이 조금씩 다릅니다. 어느 센터로 가야 할지는 상담 때 안내해 드립니다.", act=btn("센터 안내 · 오시는 길", href("centers"), "btn-line"))
                 + f'<div class="branch"><div class="br-list rv">{brs}</div><div class="br-map rv"><iframe data-map data-addr="{b0["addr"]}" data-name="{b0["name"]}" title="센터 위치 지도" loading="lazy"></iframe>'
                 f'<div class="br-info"><p>{b0["name"]}<small>{b0["addr"]} {b0["addr2"]}</small></p><div><a class="btn btn-sm btn-line br-tel" href="tel:{b0["tel"].replace("-", "")}">{ic("tel")}<span>{b0["tel"]}</span></a>'
                 f'<a class="btn btn-sm btn-ink br-go" href="https://map.naver.com/p/search/{b0["addr"]}" target="_blank" rel="noopener">길찾기</a></div></div></div></div>' + strip, soft=True)

    start = sec(head("처음 오시는 분", "상담부터 수업까지, <em>이렇게 진행됩니다</em>", "", act=btn("이용 절차 자세히", href("guide"), "btn-line"))
                + '<div class="start"><ol class="st-steps rv"><li><b>예약 · 초기 상담</b><span>전화로 예약하고, 아이의 발달 상태와 걱정되는 점을 나눕니다.</span><em><span>전화 · 카카오톡 · 네이버 예약</span></em></li><li><b>평가 · 결과 상담</b><span>아이의 상태를 다각도로 살핀 뒤 치료가 필요한지, 어떤 계획이 맞는지 함께 정합니다.</span><em><span>필요한 치료만 권합니다</span></em></li>'
                  '<li><b>수업 · 보호자 상담</b><span>수업 뒤에는 매번 보호자 상담이 이어지고, 회기마다 목표를 점검합니다.</span><em><span>수업 40분 + 상담 10분</span></em></li></ol>'
                  f'<div class="vbox rv"><h3>정부 바우처로 이용할 수 있습니다</h3><p>킨더윌은 아래 바우처의 제공기관입니다. 대상과 신청 방법을 확인해 보세요.</p><ul><li>발달재활</li><li>영유아 발달지원</li><li>아동청소년 심리지원</li><li>교육청(굳센카드)</li><li>전국민마음투자</li></ul>{btn("바우처 안내 보기", href("voucher"), "")}</div></div>')

    about = sec(f'<div class="about"><figure class="about-img rv">{img("director", "이유진 대표원장")}<figcaption><b>이유진 대표원장</b><span>1급 언어재활사 · 언어치료학 석사</span></figcaption></figure>'
                '<div class="about-tx"><span class="eb rv">킨더윌 소개</span><h2 class="rv">Kinder <em>+</em> Will<br>우리 아이들의 의지와 열정</h2>'
                '<p class="rv">킨더윌은 우리 아이들이 주도적인 의지와 열정으로 행복한 꿈과 미래를 만들어 가는 곳입니다. 병원 재활의학과와 정신건강의학과 학습클리닉, 여러 기관의 언어재활사로 쌓은 경험을 바탕으로, 통합적인 접근으로 아이의 잠재력을 끌어올리고자 문을 열었습니다.</p>'
                '<p class="quote rv">“아이들 한 명 한 명을 위한 맞춤형 통합치료로, 진정성 있게 함께하겠습니다.”</p>'
                '<ul class="nums rv"><li><b>2016<small>년</small></b><span>언어심리센터로 개원</span></li><li><b>30<small>여 명</small></b><span>분야별 전문가</span></li><li><b>12<small>실</small></b><span>언어 · 인지 교실</span></li><li><b>1~4<small>센터</small></b><span>노원 상계동</span></li></ul>'
                + f'<a class="faces rv" href="{href("team")}"><ul>' + "".join(f'<li>{img(f"team/t{n:02d}", "")}</li>' for n in (2, 8, 13, 16, 7)) + f'</ul><p>언어 · 심리 · 감각통합 · 인지 전문가<small>분야별 선생님을 소개합니다</small></p>{A}</a>'
                '<ul class="trust rv"><li><b>2024 KBPA</b><span>발달재활서비스 분야 우수</span></li><li><b>EBS 메디컬다큐 7요일</b><span>2019년 출연</span></li><li><b>EBS 나눔 0700</b><span>2024년 출연</span></li></ul>'
                f'<div class="about-act rv">{btn("인사말 보기", href("about"), "btn-ink")}{btn("전문가 소개", href("team"), "btn-line")}</div></div></div>', soft=True)

    rv = sec(head("부모님들의 이야기", "네이버 <em>방문자 리뷰</em>", "", act=f'<a class="btn btn-line" href="{NREVIEW}" target="_blank" rel="noopener">네이버에서 리뷰 전체 보기{ic("ext")}</a>')
             + '<ul class="rvw">' + "".join(f'<li class="rv"><q>{t}</q><cite><i>{n[0]}</i>{n} 님 · 네이버 방문자 리뷰</cite></li>' for t, n in REVIEWS) + f'</ul><p class="swipe-tip">{ic("arr")}옆으로 넘겨 더 보세요</p>'
             + '<p class="rvw-foot rv">네이버 플레이스(킨더윌사회성언어전문센터 2센터)에 남겨 주신 방문자 리뷰 가운데 일부를 한 문장씩 옮겼습니다.</p>')

    bl = ""
    if blog:
        cards_b = "".join(f'<a class="bl rv{"" if b.get("img") else " noimg"}" href="{e(b["link"])}" target="_blank" rel="noopener"><div class="bl-img">' + (img("blog/" + b["img"], "") if b.get("img") else "KINDER WILL")
                          + f'</div><div class="bl-b"><small>{e(b["cat"].split(":")[-1])}</small><b>{e(b["title"])}</b><time datetime="{b["date"]}">{b["date"].replace("-", ". ")}</time></div></a>' for b in blog)
        bl = sec(head("킨더윌 이야기", "블로그에서 전하는 <em>수업 이야기</em>", "수업 장면과 발달 정보를 블로그에 꾸준히 올리고 있습니다.", act=btn("블로그 소식 더 보기", href("news"), "btn-line")) + f'<div class="blog">{cards_b}</div>', soft=True)

    body = hero + quick + '<main id="main">\n' + worry + social + cards + ks + branch + start + about + rv + bl + "</main>\n" + cta_band()
    pre = (f'<link rel="preload" as="image" href="images/hero.webp?v={V}" media="(min-width: 900px), (orientation: landscape)" fetchpriority="high">\n'
           f'<link rel="preload" as="image" href="images/hero-p.webp?v={V}" media="(max-width: 899px) and (orientation: portrait)" fetchpriority="high">\n')
    return doc("index", SITE, "서울 노원구 상계동 킨더윌 사회성언어전문센터 — 사회성 그룹 프로그램, 언어 · 놀이 · 미술 · 감각통합 · 인지 치료, 심리상담, 학습 프로그램, 키즈스텝 스마트성장센터. 발달재활 · 지역사회서비스 · 교육청 바우처 제공기관.", body, body_cls="home", preload=pre)
