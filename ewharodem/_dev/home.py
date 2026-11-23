"""홈(index.html). 문장은 연구소 블로그 글에서 가져와 다듬었다."""
from kit import *
import sym

def hero():
    slides = [("hero-art", "미술치료실 — 파란 벽에 걸린 그림과 초록 책상", "미술치료실"), ("hero-speech", "언어치료실 — 교구가 놓인 선반과 책상", "언어치료실"), ("hero-lobby", "이화아동발달연구소 입구 — 가운데 연구소 간판과 치료실 문", "입구")]
    pics = ""
    for i, (n, a, _) in enumerate(slides):
        if i == 0: pics += f'<div class="hero-pic on"><picture><source media="(max-width: 760px)" srcset="images/{n}-m.webp?v={V}"><img src="images/{n}.webp?v={V}" alt="{e(a)}" width="1600" height="1000" fetchpriority="high"></picture></div>'
        else: pics += f'<div class="hero-pic"><img data-src="images/{n}.webp?v={V}" data-src-m="images/{n}-m.webp?v={V}" alt="{e(a)}" width="1600" height="1000"></div>'   # 둘째 장부터는 첫 화면이 뜬 뒤에 받는다
    nav = "".join(f'<button type="button"{" class=\"on\"" if i == 0 else ""} aria-label="{n} 사진 보기"><i></i><span>{n}</span></button>' for i, (_, _, n) in enumerate(slides))
    return f'''<section class="hero">
  <div class="wrap">
    <div class="hero-card">
      <div class="hero-pics">{pics}</div>
      <div class="hero-txt">
        <p class="hero-kick">{PETAL}<span>2003년부터 · 서울 노원 상계동</span></p>
        <h1><span class="nb">속도의 차이가 있을 뿐,</span> <span class="nb">아이는 <em class="mark">각자의 방식</em>으로</span> <span class="nb">성장합니다</span></h1>
        <p class="hero-lead">언어 · 인지 · 음악 · 미술. <span class="nb">특수학교 교사 출신으로</span> <span class="nb">임상 경력 30년이 넘는 원장 · 부원장과</span> <span class="nb">치료진이 아이 한 명, 한 명의</span> <span class="nb">속도에 맞춥니다.</span></p>
        <div class="hero-btns">{tel_btn("white", "전화 상담 예약")}{btn("프로그램 보기", "#programs", "ghost")}</div>
      </div>
      <div class="hero-nav" role="group" aria-label="공간 사진">{nav}</div>
    </div>
    <aside class="hero-panel" aria-label="상담 안내">
      <div><p class="hp-label">상담 예약 · 문의</p><a class="hp-tel" href="tel:{TEL}">{TEL}</a></div>
      <div class="hp-info"><p><b>전화 문의</b>{CALL_HOURS}</p><p><b>오시는 길</b>4호선 상계역 걸어서 9분 · 주차</p></div>
      <p class="hp-state" data-tel-state>전화로 예약한 뒤 방문 상담을 합니다</p>
    </aside>
  </div>
</section>
'''

def voice():
    """연구소가 글마다 맺음말로 쓰는 문장 + 사실 네 가지"""
    rows = [("2003년", "이화로뎀나무교육원으로 문을 엶"), ("30년 이상", "원장 · 부원장의 임상 경력"), ("9명", "원장 · 부원장을 포함한 치료진"), ("2011년", "발달재활서비스 제공기관 선정")]
    return f'''<section class="voice"><div class="wrap">
  <blockquote class="rv"><p><span class="nb">아이들이 자신의 방식으로</span> <span class="nb">세상과 소통하고,</span> <span class="nb">일상 속에서 보다 독립적이고</span> <span class="nb">의미 있는 삶을</span> <span class="nb">살아갈 수 있도록</span> <span class="nb">아이들과 함께 성장하고 있습니다.</span></p><footer>{PETAL}<span>연구소가 글마다 남기는 맺음말</span></footer></blockquote>
  <dl class="voice-facts">{"".join(f'<div class="rv"><dt>{t}</dt><dd>{d}</dd></div>' for t, d in rows)}</dl>

  <figure class="voice-pic rv">{img("g-w-hands", "선생님의 손이 아이의 작은 손을 부드럽게 감싸 쥔 모습", sizes="100vw")}</figure>
</div></section>
'''

def programs():
    T = [  # (파일, 걱정 문장, 프로그램 이름, 풀이, 상징, 모양)
        ("speech", "또래보다 <span class=\"nb\">말이 늦어요</span>", "말 · 언어", "언어치료", "talk", "big"),
        ("aac", "말 대신 울음이나 <span class=\"nb\">떼로 표현해요</span>", "그림으로 말하기", "그림 카드 · 의사소통 판", "give", "blue"),
        ("learning", "글자는 아는데 <span class=\"nb\">읽기를 힘들어해요</span>", "읽기 · 학습", "인지치료", "book", ""),
        ("aba", "이름을 불러도 <span class=\"nb\">잘 돌아보지 않아요</span>", "행동 · 조기교실", "응용행동분석(ABA)", "seed", ""),
        ("arts", "말 말고 다른 <span class=\"nb\">표현 방법을 찾아요</span>", "음악 · 미술", "음악치료 · 미술치료", "note", ""),
        ("group", "친구와 어울리기, <span class=\"nb\">입학이 걱정돼요</span>", "그룹 활동", "사회성 · 학교 준비 · 시기별 모집", "friends", "band"),
    ]
    tiles = ""
    for i, (f, worry, name, kind, s, shape) in enumerate(T, 1):
        pic = img("g-speech-a", "", sizes="(max-width: 760px) 100vw, 640px") if shape == "big" else f'<span class="b-sym">{sym.icon(s)}</span>'
        tiles += f'<a class="bento{" b-" + shape if shape else ""} rv" href="{href(f)}"><span class="b-no">{i:02d}</span>{pic}<span class="b-txt"><strong>{worry}</strong><span class="b-name"><b>{name}</b><small>{kind}</small></span></span><span class="b-go">{I["arrow"]}</span></a>'
    return sec(head("프로그램", "이런 걱정이 있다면, <span class=\"nb\"><em class=\"mark\">여기서부터</em> 보세요</span>", "어디에 해당하는지 모르겠다면 전화로 먼저 물어보셔도 됩니다.") + f'<div class="bentos">{tiles}</div>', "sec-soft", "programs")

def living():
    acts = {"fries": ("감자튀김 만들기", [("fries", "감자튀김"), ("ketchup", "케첩"), ("fryer", "에어프라이어")]), "pizza": ("피자 만들기", [("pizza", "피자"), ("cheese", "치즈"), ("oven", "오븐")])}
    core = "".join(sym.card(k, t, "core") for k, t in [("give", "주세요"), ("eat", "먹어요"), ("yummy", "맛있어요")])
    fringe = "".join(f'<span class="fr-set{" on" if k == "fries" else ""}" data-set="{k}">' + "".join(sym.card(a, b) for a, b in v[1]) + "</span>" for k, v in acts.items())
    seg = "".join(f'<button type="button" data-set="{k}"{" class=\"on\" aria-pressed=\"true\"" if k == "fries" else " aria-pressed=\"false\""}>{v[0]}</button>' for k, v in acts.items())
    return sec(f'''<div class="living">
  <div class="living-pic rv">{figure("aac-board", "에어프라이어 옆에 놓인 의사소통 판 — 위에는 감자튀김 · 케첩 · 접시 같은 그림, 아래에는 맛있어요 · 먹어요 그림", "감자튀김 만들기 활동에 쓴 의사소통 판 (2026년 6월, 청소년 소그룹)", sizes="(max-width: 1080px) 100vw, 620px")}</div>
  <div class="living-txt"><p class="eye">{PETAL}그림으로 말하기</p>
    <h2><span class="nb">교재 속이 아니라,</span> <span class="nb">생활 속에서 배웁니다</span></h2>
    <p class="lead">말로 표현하기 어려운 아이는 그림 카드와 의사소통 판으로 먼저 뜻을 전합니다. 연구소에서는 마트에 가고 간식을 만드는 실제 활동 속에서 그 방법을 연습합니다.</p>
    <div class="vocab" data-vocab>
      <div class="vocab-row"><p><b>늘 쓰는 말</b>어느 활동에서나</p><div class="syms">{core}</div></div>
      <div class="vocab-row"><p><b>바뀌는 말</b>활동에 따라</p><div class="syms fr">{fringe}</div></div>
      <div class="vocab-foot"><div class="seg" role="group" aria-label="활동 바꿔 보기"><span class="seg-ind"></span>{seg}</div>
      <p class="vocab-say" aria-live="polite">활동이 바뀌어도 <b>주세요 · 먹어요 · 맛있어요</b>는 그대로 씁니다.</p></div>
    </div>
    {btn("그림으로 말하기 자세히", href("aac"), "line")}
  </div>
</div>''', "sec-living")

def people():
    lead = [("원장", "서도희", ["이화여자대학교 특수교육학", "前 명현학교 특수교사", "임상 경력 30년 이상"]), ("부원장", "황진태", ["이화여자대학교 특수교육학", "前 홀트학교 특수교사", "임상 경력 30년 이상"])]
    big = "".join(f'<article class="lead-card rv"><p class="role">{r}</p><h3>{n}</h3>{dots(d)}</article>' for r, n, d in lead)
    team = [("언어재활", "3명", "모두 언어재활사 1급 · 그림 의사소통(PECS · AAC) 과정 수료"), ("음악재활", "2명", "음악치료 석사 · 임상 경력 20년, 12년"), ("미술재활", "2명", "임상 경력 각 13년")]
    rows = "".join(f'<li class="rv"><b>{t}</b><i>{n}</i><span>{d}</span></li>' for t, n, d in team)
    return sec(f'''<div class="people">
  <div class="people-head"><p class="eye">{PETAL}함께하는 사람들</p><h2><span class="nb">특수학교 교실에서</span> <span class="nb">시작한 <em class="mark">30년</em>의 경험</span></h2>
    <p class="lead">원장과 부원장은 특수학교 교사로 아이들을 가르쳤고, 지금은 인지치료를 직접 맡고 있습니다.</p>
    <ul class="people-team">{rows}</ul>{btn("치료진 모두 보기", href("team"), "line")}</div>
  <div class="people-lead">{big}</div>
</div>''', "sec-people")

def cost():
    v = [("발달재활서비스", "보건복지부", "만 18세 미만 장애아동 중 선정자 (만 9세 미만 발달지연 아동도 신청할 수 있습니다)", "2011년부터 제공기관"), ("치료지원 (굳센카드)", "교육청", "유 · 초 · 중 · 고에 다니는 특수교육대상 학생", "2012년부터 제공기관")]
    cardz = "".join(f'<article class="v-card rv"><p class="v-by">{by}</p><h3>{t}</h3><p>{who}</p><p class="v-since">{I["check"]}{since}</p></article>' for t, by, who, since in v)
    return sec(f'''<div class="cost">
  <div class="cost-head">{tag("바우처 · 비용", "on-brand")}<h2><span class="nb">정부 바우처로</span> <span class="nb">이용할 수 있습니다</span></h2>
    <p class="lead">두 가지 바우처를 쓸 수 있는 제공기관입니다. 유형별 지원금과 본인부담금은 표로 정리해 두었습니다.</p>{btn("금액표 보기", href("voucher"), "white")}</div>
  <div class="cost-cards">{cardz}</div>
</div>''', "sec-brand")

def start():
    st = [("전화로 예약합니다", f"아이의 나이와 걱정되는 점을 들려주세요. 전화 문의는 {CALL_HOURS}에 받습니다."), ("방문해서 상담합니다", "예약한 날 연구소에서 아이의 지금 모습을 함께 살펴봅니다. 필요하면 언어발달 평가를 합니다."), ("아이에게 맞춰 시작합니다", "발달 수준을 살핀 뒤 아이마다 목표를 정하고, 작은 단계로 나누어 수업합니다.")]
    rows = "".join(f'<li class="rv"><b>{i}</b><div><h3>{t}</h3><p>{d}</p></div></li>' for i, (t, d) in enumerate(st, 1))
    return sec(f'''<div class="start">
  <div class="start-head"><h2><span class="nb">시작은</span> <span class="nb"><em class="mark">전화 한 통</em>입니다</span></h2><p class="lead">온라인 예약은 받지 않습니다. 전화로 예약한 뒤 방문해 주세요.</p>{btn("처음 오셨나요", href("guide"), "line")}<figure class="start-pic">{img("g-w-read", "소파에 나란히 앉아 그림책을 함께 보는 엄마와 아이의 뒷모습", sizes="(max-width: 1080px) 100vw, 480px")}</figure></div>
  <ol class="start-list">{rows}</ol>
</div>''', "sec-start")

def space():
    P = [("lounge", "대기실"), ("speech1", "언어치료실"), ("cog1", "인지치료실"), ("art", "미술치료실"), ("music", "음악치료실"), ("speech3", "언어치료실"), ("lobby", "입구"), ("hall", "복도")]
    one = "".join(f'<figure>{img(n + "-s", t + " 사진", small=False)}<figcaption>{t}</figcaption></figure>' for n, t in P)
    dup = "".join(f'<figure>{img(n + "-s", "", small=False)}<figcaption>{t}</figcaption></figure>' for n, t in P)
    return f'''<section class="sec sec-space"><div class="wrap">{head("", "<span class=\"nb\">아이들이 오가는</span> <span class=\"nb\">파란 벽의 교실들</span>", "", ("공간 둘러보기", href("space")), "plain")}</div>
<div class="marq" data-marq><div class="marq-in">{one}<div class="marq-dup" aria-hidden="true">{dup}</div></div></div></section>
'''

def visit():
    info = kv([("주소", f"{ADDR}<br><small>계상초등학교 맞은편, 궁전보석사우나 건물 3층</small>"), ("지하철", "4호선 상계역 걸어서 9분 · 7호선 마들역 걸어서 15분"), ("주차", "건물 주차장 이용"), ("수업 운영", OPEN_HOURS), ("전화 문의", CALL_HOURS)])
    return sec(f'''<div class="visit">
  <div class="visit-map rv"><iframe title="{SITE} 지도" src="https://xim.plators.com/map?addr={e("서울 노원구 한글비석로 444")}&name={e(SITE)}&c=2f4880" loading="lazy"></iframe></div>
  <div class="visit-txt"><p class="eye">{PETAL}오시는 길</p><h2><span class="nb">상계역에서</span> <span class="nb">걸어서 9분</span></h2>{info}
    <a class="bigtel" href="tel:{TEL}">{I["phone"]}<b>{TEL}</b></a><p class="tel-state" data-tel-state>전화 문의 {CALL_HOURS}</p>
    <div class="visit-btns">{btn("네이버 지도에서 보기", NMAP, "line", "out", ' target="_blank" rel="noopener"')}{btn("오시는 길 자세히", href("location"), "line")}</div>
  </div>
</div>''', "sec-visit sec-soft")

def home():
    pre = f'<link rel="preload" as="image" href="images/hero-art.webp?v={V}" media="(min-width: 761px)" fetchpriority="high">\n<link rel="preload" as="image" href="images/hero-art-m.webp?v={V}" media="(max-width: 760px)" fetchpriority="high">\n'
    body = '<main id="main">\n' + hero() + voice() + programs() + living() + people() + cost() + start() + space() + visit() + "</main>\n"
    return doc("index", SITE, "서울 노원구 상계동의 아동 · 청소년 특수교육 전문기관. 언어치료 · 인지치료 · 음악 · 미술치료, PECS · AAC. 발달재활서비스 · 교육청 치료지원 바우처 제공기관. 상담 예약 02-949-0842", body, body_cls="home", preload=pre)
