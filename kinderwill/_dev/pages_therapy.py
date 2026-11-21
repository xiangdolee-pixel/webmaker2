from kit import *
"""치료 · 상담 6쪽 — 언어 · 놀이 · 미술 · 감각통합 · 인지 치료(같은 틀 therapy() 하나) + 심리상담"""

# ── 선생님(전문가 소개 게시판 표기 그대로 — 이름 가운데 글자는 가림).  키: (그림, 이름, 자격 한 줄, 소속)
T = dict(
    lee=("director", "이유진", "1급 언어재활사 · 언어치료학 석사", "1 · 2 · 3센터"),
    t02=("team/t02", "지*영", "1급 언어재활사", "3센터"),
    t16=("team/t16", "박*숙", "2급 언어재활사 · 사회복지학 석사", "2센터"),
    t17=("team/t17", "고*라", "2급 언어재활사", "2센터"),
    t18=("team/t18", "김*진", "2급 언어재활사", "2센터"),
    t19=("team/t19", "김*슬", "2급 언어재활사", "2센터"),
    t20=("team/t20", "이*주", "2급 언어재활사 · 1급 놀이심리상담사", "2 · 3센터"),
    t21=("team/t21", "박*지", "1급 언어재활사", "3센터"),
    t22=("team/t22", "임*솜", "2급 언어재활사", "1 · 2 · 3센터"),
    t23=("team/t23", "윤*지", "2급 언어재활사", "2센터"),
    t24=("team/t24", "황*애", "2급 언어재활사", "1 · 2센터"),
    t25=("team/t25", "김*롱", "2급 언어재활사", "2센터"),
    t03=("team/t03", "김*희", "미술심리상담사 1급 · 임상미술치료학 석사", "1 · 2 · 3센터"),
    t04=("team/t04", "김*연", "임상심리사 2급 · 아동심리치료학과 석사", "2센터"),
    t05=("team/t05", "장*영", "임상심리사 2급 · 미술교육과 석사", "2센터"),
    t06=("team/t06", "김*동", "심리상담사 · 상담전공 박사", "1 · 2 · 3센터"),
    t13=("team/t13", "박*선", "심리상담사 1급 · 청소년상담사 1급", "2센터"),
    t14=("team/t14", "이*주", "임상심리사 2급 · 놀이심리상담사 1급", "2 · 3센터"),
    t15=("team/t15", "엄*진", "임상심리사 2급 · 연극치료학과 석사", "2센터"),
    t07=("team/t07", "김*연", "학습장애(난독증) 교육상담사 1급", "2센터"),
    t08=("team/t08", "송*진", "작업치료사 · 감각통합전문가 2급", "2 · 3센터"),
    t09=("team/t09", "노*림", "작업치료사", "2센터"),
    t10=("team/t10", "배*섭", "작업치료사", "2센터"),
    t11=("team/t11", "윤*은", "작업치료사 · 감각발달재활사", "2센터"),
    t12=("team/t12", "윤*희", "작업치료사 · 특수체육지도사 2급", "2센터"),
)
def people(rows):
    """작은 선생님 카드 — rows = [(키, 맡은 일)]"""
    out = []
    for k, role in rows:
        im, name, cert, where = T[k]
        out.append(f'<div class="tm rv"><div class="tm-face">{img(im, name + " 선생님")}</div><small>{role}</small><b>{name}<em>{where}</em></b><span class="tm-c">{cert}</span></div>')
    return '<div class="team">' + "".join(out) + "</div>"
def centers(keys):
    rows = []
    for k in keys:
        b = BR[k]
        rows.append((b["short"], [f'{b["addr"]} {b["addr2"]}', f'<a href="tel:{b["tel"].replace("-", "")}"><b>{b["tel"]}</b></a>'] if b["tel"] else [f'{b["addr"]} {b["addr2"]}']))
    return dl(rows)

CARD = dict(  # 같이 보면 좋은 치료 카드: 그림, 한 줄
    speech=("p_speech", "언어치료", "언어 발달 수준을 평가하고 아이에게 맞는 계획으로 진행합니다."),
    play=("p_play", "놀이치료", "놀이를 통해 마음 상태를 살피고 정서적 어려움을 풀어 갑니다."),
    art=("p_art", "미술치료", "미술 매체로 내면의 감정을 표현하도록 돕습니다."),
    sensory=("c2sensory", "감각통합치료", "감각 처리 · 자기 조절 · 운동과 협응을 키웁니다."),
    cognitive=("p_cognitive", "인지치료", "이해하고 처리하는 힘, 학습의 기초를 다집니다."),
    counsel=("p_counsel", "심리상담", "유아 · 아동부터 청소년 · 성인까지 연령별로 상담합니다."),
)
def related(files, eb="같이 보면 좋은 치료", h2="함께 살펴보면 <em>도움이 되는 치료</em>"):
    cards = "".join(f'<a class="pc rv" href="{href(f)}"><div class="pc-img">{img(CARD[f][0], "")}</div><div class="pc-b"><small>{"유아 ~ 성인" if f == "counsel" else "1:1 치료"}</small><h3>{CARD[f][1]}</h3><p>{CARD[f][2]}</p>{more()}</div></a>' for f in files)
    return head(eb, h2, "어떤 치료가 맞는지는 초기 상담과 평가 뒤에 함께 정합니다.") + f'<div class="cards">{cards}</div>'

VOUCHER = dict(dev="발달재활", com1="영유아 발달지원", com2="아동청소년 심리지원", edu="교육청(굳센카드)")

THERAPY = [
    dict(file="speech", name="언어치료", bg="p_speech", pic=("c1speech", "작은 책상과 교구장이 있는 언어치료실", "tall"),
         ph="말이 늦거나 발음 · 유창성이 걱정될 때, 평가에서 시작하는 1:1 언어치료입니다.",
         lead="언어치료는 아이의 <em>언어 발달 수준을 평가</em>하고, 아이에게 맞춘 치료 계획에 따라 체계적으로 진행합니다.",
         needs=["언어발달지연<small>수용 언어 · 표현 언어 · 단순 언어 장애</small>", "조음장애<small>부정확한 발음</small>", "유창성장애<small>말 더듬기 · 빨리 말하기</small>",
                "지적장애로 인한 언어발달지연", "신경언어장애<small>뇌 손상</small>", "청각장애<small>청력 손실</small>", "의사소통 기술의 어려움<small>화용언어 · 공감언어 사용의 어려움</small>"],
         needs_note="킨더윌 언어치료는 <b>아동 · 성인 치료 모두 가능</b>합니다. 성인 언어치료가 필요하신 분도 편하게 문의해 주세요.",
         step2=("초기 상담 및 언어 검사", "상담 뒤 언어 검사로 아이의 언어 상태를 평가합니다."),
         team=[("lee", "대표원장")] + [(k, "언어치료") for k in "t02 t16 t17 t18 t19 t20 t21 t22 t23 t24 t25".split()],
         vouchers=["dev", "com1", "com2", "edu"], vnote="", centers=["c1", "c2", "c3"], rel=["play", "sensory", "cognitive"]),
    dict(file="play", name="놀이치료", bg="p_play", pic=("c2play", "주방놀이와 인형의 집이 있는 놀이치료실", "tall"),
         ph="마음과 관계의 어려움을 아이에게 가장 편한 말, 놀이로 풀어 갑니다.",
         lead="놀이치료는 초기 상담과 평가로 아이의 마음 상태를 살피고, <em>놀이를 통해</em> 정서적인 어려움을 풀어 가도록 돕습니다.",
         needs=["상호작용이 부족하고 또래 관계를 잘 맺지 못하는 아이", "감정 조절이 어려운 아이", "불안 · 우울하거나 위축된 아이", "주의 집중이 어렵고 충동성을 조절하기 힘든 아이",
                "놀이 기능이 많이 부족한 아이", "부모 · 형제와의 관계에서 어려움을 보이는 아이"],
         step2=("초기 상담 및 놀이 평가", "상담 뒤 놀이를 통해 아이의 상태와 마음을 살핍니다."),
         team=[(k, "놀이치료") for k in "t04 t14 t15".split()],
         vouchers=["dev", "com1", "com2", "edu"], vnote="", centers=["c1", "c2"], rel=["art", "speech", "counsel"]),
    dict(file="art", name="미술치료", bg="p_art", pic=("p_book", "색종이와 그림책이 놓인 책상에서 만들기를 하는 아이의 손", ""),
         ph="말로 하기 어려운 감정을 그림과 만들기로 표현하도록 돕습니다.",
         lead="미술치료는 초기 상담과 평가로 아이의 상태를 살피고, <em>미술 매체</em>로 내면의 감정을 표현하도록 돕습니다.",
         needs=["상호작용이 부족하고 또래 관계를 잘 맺지 못하는 아이", "감정 조절이 어려운 아이", "불안 · 우울하거나 위축된 아이", "주의 집중이 어렵고 충동성을 조절하기 힘든 아이",
                "자기표현(감정 표현)이 어려운 아이", "부모 · 형제와의 관계에서 어려움을 보이는 아이"],
         step2=("초기 상담 및 평가", "상담 뒤 아이의 상태와 마음을 살핍니다."),
         team=[(k, "미술치료") for k in "t03 t05 t13 t06".split()],
         vouchers=["dev", "com1", "com2", "edu"], vnote="", centers=["c2"], rel=["play", "counsel", "sensory"]),
    dict(file="sensory", name="감각통합치료", bg="c2sensory", pic=("p_sensory", "천 그네에 앉은 아이의 뒷모습과 그네를 잡아 주는 선생님", ""),
         ph="감각 · 자세 · 조절의 어려움을 몸으로 겪고 익히며 풀어 갑니다.",
         lead="감각통합치료는 초기 상담과 평가로 아이의 상태를 살피고, 맞춤 계획을 세워 <em>신체와 감각 기능</em>의 발달을 돕습니다.",
         needs=["감각이 예민하거나 둔감한 아이", "감각 자극을 추구하는 아이", "착석이 어려운 아이", "자기 조절 능력이 부족한 아이",
                "대근육 발달이 부족한 아이", "소근육 발달이 부족한 아이", "협응 능력이 부족한 아이", "상호작용이 부족하고 언어 발달이 느린 아이"],
         step2=("초기 상담 및 평가", "상담 뒤 아이의 상태를 평가합니다."),
         team=[(k, "감각통합치료") for k in "t08 t09 t10 t11 t12".split()],
         vouchers=["dev", "com1", "com2", "edu"], vnote="", centers=["c2"], rel=["speech", "play", "cognitive"]),
    dict(file="cognitive", name="인지치료", bg="p_cognitive", pic=("p_parent", "기록지를 함께 보며 이야기하는 보호자 상담", ""),
         ph="이해하고 처리하는 힘, 집중과 학습의 기초를 다지도록 돕습니다.",
         lead="인지치료는 초기 상담과 평가로 아이의 <em>인지 · 학습 능력</em>을 살피고, 아이에게 맞춘 치료 계획으로 진행합니다.",
         needs=["과제를 체계적으로 해내는 데 어려움이 있는 아이", "정보를 이해하고 처리하는 속도가 느린 아이", "학습 동기는 있으나 학습 방법을 모르는 아이", "주의 집중이 짧고 산만한 아이",
                "지능은 평균이거나 그 이상이지만 특정 영역이 어려운 아이<small>읽기 · 쓰기 · 셈 · 독해력 등</small>", "발달장애로 교육적 도움이 필요한 아이"],
         step2=("초기 상담 및 평가", "상담 뒤 아이의 상태를 평가합니다."),
         team=[("t07", "인지치료")],
         vouchers=["dev"], vnote="교육청 바우처는 인지 영역을 지원하지 않습니다. 그 밖의 바우처로 이용할 수 있는지는 상담 때 안내해 드립니다.", centers=["c2"], rel=["speech", "sensory", "play"]),
]

def therapy(d):
    n = d["name"]; pic, alt, pcls = d["pic"]
    intro = sec(f'<div class="two">'
                f'<div class="stack"><p class="lead rv">{d["lead"]}</p>'
                f'<div class="body rv"><p>킨더윌은 아이에게 꼭 필요한 치료만 권하며 불필요한 치료는 권하지 않습니다. 그래서 치료를 시작하기 전에 초기 상담과 평가로 아이의 상태를 먼저 살피고, 치료가 필요한지부터 보호자와 함께 정합니다.</p></div>'
                f'<div class="rv">{ticks(["1:1 수업 40분 + 보호자 상담 10분", "회기마다 담당 치료사가 목표를 점검", "사후검사로 종결 시기를 함께 결정"])}</div>'
                f'<div class="about-act rv">{btn("상담 문의하기", href("contact"))}{btn("진행 과정 보기", "#steps", "btn-line", arrow=False)}</div></div>'
                f'<div class="rv">{shot(pic, alt, pcls)}</div></div>')
    need = sec(head("이런 경우에 도움이 됩니다", f"{n}, <em>이럴 때</em> 살펴보세요", "아래와 비슷한 모습이 보인다면 상담에서 함께 살펴볼 수 있습니다. 치료가 필요한지는 평가 뒤에 정합니다.")
               + f'<div class="stack">{needs(d["needs"])}{note(d["needs_note"]) if d.get("needs_note") else ""}</div>', soft=True)
    st = [("초기 상담 예약", "전화로 초기 상담을 예약합니다."), d["step2"], ("검사 결과 상담", "결과를 바탕으로 치료가 필요한지 정하고 보호자와 상담합니다."),
          ("치료 시작", "매회 40분 수업과 10분 보호자 상담으로 진행합니다."), ("회기 목표 상담", "회기마다 담당 치료사가 목표를 이루었는지 점검하고 상담합니다."),
          ("사후검사 및 종결", "사후검사로 목표를 이룬 부분을 평가하고 종결 시기를 정합니다.")]
    proc = sec(head("진행 과정", f"{n}는 <em>이렇게 진행</em>됩니다", "예약부터 종결까지 여섯 단계입니다.")
               + f'<div class="stack">{steps(st)}{box("매회 수업 40분 + 보호자 상담 10분", "수업이 끝나면 매번 담당 치료사가 그날 수업 내용과 아이의 모습을 보호자께 말씀드립니다. 궁금한 점은 이 시간에 편하게 물어보세요.", small="수업 시간", icon="cal", cls="teal")}</div>', id="steps")
    team = sec(head("담당 전문가", f"{n}를 맡는 <em>선생님</em>", "", act=btn("전문가 소개 전체 보기", href("team"), "btn-line")) + people(d["team"]), soft=True)
    vb = (f'<div class="vbox rv"><h3>바우처로 이용할 수 있습니다</h3><p>{n}에 쓸 수 있는 바우처입니다. 대상과 신청 방법은 바우처 안내에서 확인해 주세요.</p>'
          f'<ul>{"".join(f"<li>{VOUCHER[v]}</li>" for v in d["vouchers"])}</ul>{btn("바우처 안내 보기", href("voucher"), "")}</div>')
    cen = (f'<div class="stack"><h3 class="h3 rv">어느 센터에서 하나요</h3>{centers(d["centers"])}'
           f'{note("그 밖의 센터에서 가능한지, 어느 센터가 맞는지는 상담 때 안내해 드립니다.")}</div>')
    use = sec(head("이용 안내", "바우처와 <em>센터</em>") + f'<div class="two top">{vb}{cen}</div>' + (f'<div style="margin-top:22px">{note(d["vnote"], warn=True)}</div>' if d["vnote"] else ""))
    extra = ""
    if d["file"] == "cognitive":
        extra = sec(f'<div class="two wide-r"><div class="rv">{shot("p_alpha", "수 막대를 맞추는 아이의 손")}</div><div><span class="eb teal rv">러닝센터 · 킨더윌 알파α</span>'
                    f'<h2 class="h3 rv" style="margin-top:12px">인지치료와 함께하는 인지학습 프로그램</h2><p class="body rv">인지치료와 더불어, 킨더윌에는 배움의 기초를 다지는 인지학습 프로그램이 있습니다.</p>'
                    f'<div class="badges rv">{"".join(f"<span class=\"tag\">{x}</span>" for x in ["놀이수학", "사고력수학", "한글떼기", "독해논술"])}</div>'
                    f'<div class="about-act rv">{btn("학습 프로그램 보기", href("alpha"), "btn-line")}</div></div></div>', soft=True)
    rel = sec(related(d["rel"]), soft=not extra)
    return subpage(d["file"], n, d["ph"], intro + need + proc + team + use + extra + rel, bg=d["bg"],
                   desc=f"킨더윌 {n} — {re.sub(r'<[^>]+>', '', d['lead'])} 1:1 수업 40분과 보호자 상담 10분.")

def counsel():
    intro = sec(f'<div class="two"><div class="stack"><p class="lead rv">킨더윌은 전국민마음투자 전문센터를 독립적으로 갖추고 있으며, <em>연령별 맞춤 상담 프로그램</em>으로 진행합니다.</p>'
                f'<div class="body rv"><p>유아 · 아동은 놀이와 미술로, 청소년과 성인은 상담으로 만납니다. 우울 · 불안 같은 정서적 어려움부터 대인관계 · 진로 고민까지, 지금의 마음을 편하게 이야기하실 수 있습니다.</p></div>'
                f'<div class="about-act rv">{btn("상담 문의하기", href("contact"))}{btn("전국민마음투자 안내", "#maum", "btn-line", arrow=False)}</div></div>'
                f'<div class="rv">{shot("c1counsel", "원목 책상과 화분이 있는 상담실", "tall")}</div></div>')
    ages = sec(head("연령별 상담 프로그램", "나이에 맞는 방법으로 <em>마음을 만납니다</em>")
               + grid([
                   box("유아 · 아동", "유아와 아동은 말로 하는 표현이 아직 충분히 발달하지 않았기 때문에, 놀이치료나 미술치료로 정서적 안정을 돕습니다.", small="놀이치료 · 미술치료", icon="smile",
                       items=["자신의 감정을 조절하는 힘", "사회성의 기초", "부모와의 애착", "자아존중감"]),
                   box("청소년", "청소년기는 신체적 성장뿐 아니라 정체성 형성, 자율성 발달, 또래 관계 형성 등 여러 변화와 혼란을 겪는 시기입니다. 상담으로 그 시기의 성장을 돕습니다.", small="청소년 상담", icon="users",
                       items=["정서적 안정", "자기 이해와 정체성 형성", "대인관계 문제 해결", "학업 스트레스 완화", "자율성과 책임감"]),
                   box("성인", "심리 · 정서 · 사회 · 직업과 관련한 여러 어려움을 함께 살피고, 삶의 질을 높일 수 있도록 전문적인 상담을 제공합니다.", small="성인 상담", icon="heart",
                       items=["정서적 안정", "자기 이해와 성장", "대인관계 개선", "삶의 전환기 문제 해결", "자기 계발"]),
               ])
               + f'<div class="about-act rv">{btn("놀이치료 보기", href("play"), "btn-line")}{btn("미술치료 보기", href("art"), "btn-line")}</div>', soft=True)
    area = ["우울", "불안", "기타 정서 문제", "스트레스", "성격", "대인관계", "가족 간 갈등", "연애 · 부부 문제", "직장 문제", "진로 고민", "트라우마", "행동 · 습관 문제(주의 집중 · 불면)", "중독(알코올 · 흡연 · 약물 등)"]
    areas = sec(head("전문상담 영역", "이런 고민을 <em>함께 이야기</em>합니다", "아래는 킨더윌이 상담하는 영역입니다. 상담의 진행과 변화는 사람마다 다를 수 있습니다.")
                + '<div class="badges rv">' + "".join(f'<span class="tag">{x}</span>' for x in area) + "</div>")
    maum = sec(head("전국민마음투자 지원사업", "바우처로 받는 <em>전문 심리상담 8회</em>", "킨더윌은 전국민마음투자 지원사업의 심리상담을 제공합니다.", act=btn("자세한 기준 · 금액 보기", href("voucher") + "#v-mind", "btn-line"))
               + f'<div class="stack">' + dl([
                   ("사업 목적", "우울 · 불안 등 정서적 어려움이 있는 분께 심리상담 서비스를 제공해, 마음 건강을 돌보고 정서적 질환을 미리 예방하며 일찍 발견하기 위한 사업입니다."),
                   ("서비스 대상", "정서적으로 어려움이 있는 분 — 나이와 소득 기준은 없습니다."),
                   ("지원 내용", "전문 심리상담 서비스 총 8회(바우처)"),
               ]) + note("신청에는 의뢰서 · 소견서 같은 증빙서류가 필요하며, 본인 부담금은 소득 수준에 따라 다릅니다. 서류와 금액은 바우처 안내에서 확인해 주세요.") + "</div>", soft=True, id="maum")
    team = sec(head("담당 상담사", "상담을 맡는 <em>선생님</em>", "", act=btn("전문가 소개 전체 보기", href("team"), "btn-line"))
               + people([("t13", "전국민마음 상담사"), ("t14", "전국민마음 상담사"), ("t15", "전국민마음 상담사"), ("t03", "심리치료"), ("t04", "심리치료"), ("t05", "심리치료"), ("t06", "심리치료")]))
    b4 = BR["c4"]
    place = sec(head("상담 장소", "상담 장소는 <em>예약 때</em> 안내해 드립니다", "전국민마음투자 상담은 4센터에서 진행합니다. 그 밖의 상담은 예약 때 장소를 안내해 드립니다.")
                + f'<div class="two top"><div class="stack">' + dl([("4센터", [f'{b4["addr"]} {b4["addr2"]}', "전국민마음투자 상담 · 러닝센터"]), ("운영 시간", HOURS)])
                + note('4센터는 직통 번호가 없습니다. 2센터 <a href="tel:029303421" style="white-space:nowrap"><b>02-930-3421</b></a> 또는 3센터 <a href="tel:029393421" style="white-space:nowrap"><b>02-939-3421</b></a>, 카카오톡 · 네이버 예약으로 문의하시면 일정과 장소를 안내해 드립니다.')
                + f'<div class="about-act rv">{btn("상담 문의하기", href("contact"))}{btn("오시는 길", href("centers") + "#c4", "btn-line")}</div></div>'
                + box("성인 언어치료도 가능합니다", "킨더윌 언어치료는 아동뿐 아니라 성인도 받을 수 있습니다. 말 · 발음 · 유창성과 관련한 어려움이 있다면 언어치료 안내를 함께 살펴보세요.", small="함께 보기", icon="talk", cls="teal")
                .replace("</div>", f'<div class="about-act">{btn("언어치료 보기", href("speech"), "btn-line")}</div></div>', 1) + "</div>", soft=True)
    rel = sec(related(["play", "art", "speech"], h2="아이를 위한 치료도 <em>함께 보세요</em>"))
    return subpage("counsel", "심리상담", "유아 · 아동부터 청소년 · 성인까지, 연령에 맞춘 상담을 진행합니다.", intro + ages + areas + maum + team + place + rel, bg="p_counsel",
                   desc="킨더윌 심리상담 — 유아 · 아동, 청소년, 성인 연령별 맞춤 상담. 전국민마음투자 지원사업 전문 심리상담 8회.")

def pages():
    return [(d["file"], therapy(d)) for d in THERAPY] + [("counsel", counsel())]
