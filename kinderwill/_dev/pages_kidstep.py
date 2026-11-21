from kit import *
"""키즈스텝 스마트성장센터 한 쪽 — 원문은 통 이미지 10장(_pc/kinderwill/src/pages/61-…md). 글 · 도표(HTML/CSS/SVG)로 다시 짠 것.
   전용 모양(.x-…)은 _dev/extra_kidstep.css (style.css 끝의 'extra_kidstep 시작 ~ 끝' 사이에 같은 내용).
   넣지 않은 것: 근거 없는 숫자 · 예상 키 · 이름 없는 후기 · 가맹 문구 · 지난 이벤트 · 출처를 대조하지 못한 연구 인용."""

TEL = BR["ks"]["tel"]
# 이 페이지에서만 쓰는 선 그림
X = dict(
    posture='<circle cx="12" cy="4.300" r="2"/><path d="M12 6.500v8.500M7.500 10h9M12 15l-3.200 6M12 15l3.200 6"/>',
    scale='<rect x="3.500" y="3.500" width="17" height="17" rx="3.500"/><path d="M7.500 11a4.500 4.500 0 0 1 9 0zM12 11l1.800-2.600"/>',
    balance='<circle cx="12" cy="4.300" r="2"/><path d="M4 10.500l8-2 8 2M12 8.500v7M9 21l3-5.500 3 5.500M3 21h18"/>',
    foot='<path d="M9.300 21.500c-2.300 0-3.400-1.900-2.900-4.300.500-2.300 1.500-3.400 1.400-5.900C7.700 8.500 9.300 6.500 12 6.500s4.200 2.300 4.200 5.300c0 2.400-1.400 3.300-1.900 5.300-.600 2.500-2.300 4.400-5 4.400z"/><path d="M13.200 12.500c-1.200 1.600-1.300 3.300-.300 4.800"/><path d="M8.500 3.500h.010M12 2.500h.010M15.500 3.500h.010"/>',
    loop='<path d="M20 12a8 8 0 0 1-13.700 5.700M4 12a8 8 0 0 1 13.700-5.700"/><path d="M17.500 2.500v4h-4M6.500 21.500v-4h4"/>',
    cam='<path d="M3.500 8.500h11v8h-11zM14.500 11l6-3v9l-6-3"/>',
    wind='<path d="M3 9h10.500a2.500 2.500 0 1 0-2.500-2.500M3 13h15a2.500 2.500 0 1 1-2.500 2.500M3 17h7.500a2.200 2.200 0 1 1-2.200 2.200"/>',
    aid='<rect x="3.500" y="6.500" width="17" height="13" rx="2.500"/><path d="M9 6.500v-2h6v2M12 10v6M9 13h6"/>',
    ar='<path d="M4 8V5.500A1.500 1.500 0 0 1 5.500 4H8M16 4h2.500A1.500 1.500 0 0 1 20 5.500V8M20 16v2.500a1.500 1.500 0 0 1-1.500 1.500H16M8 20H5.500A1.500 1.500 0 0 1 4 18.500V16"/><path d="M12 7.500l4 2.200v4.600l-4 2.200-4-2.200V9.700zM12 12l4-2.300M12 12v4.500M12 12L8 9.700"/>',
    star='<path d="M12 3.500l2.500 5.300 5.800.700-4.300 4 1.100 5.700L12 16.400l-5.100 2.800L8 13.500l-4.300-4 5.800-.700z"/>',
)
xi = lambda k: svg(X[k]) if k in X else ic(k)


def _intro():
    jump = [("why", "왜 측정부터"), ("system", "성장 시스템"), ("report", "성장 리포트"), ("program", "프로그램"), ("people", "함께하는 사람"), ("visit", "오시는 길")]
    left = ('<div class="rv"><span class="eb x-eb">KIDSTEP — SMART GROWTH CENTER</span>'
            '<p class="lead" style="margin-top:16px">아이의 성장은 운동이 아니라 ‘관리’입니다.</p>'
            '<div class="body" style="margin-top:14px"><p>키즈스텝 스마트성장센터는 아이의 성장을 <b>측정하고, 분석하고, 관리합니다.</b> '
            '신체 활동에 두뇌 발달과 사회성 발달을 더해, 몸과 생각과 관계가 함께 자라도록 돕는 성장 프로그램입니다.</p></div>'
            '<ul class="x-bbs" aria-label="키즈스텝이 함께 다루는 세 가지"><li><b>Body</b>신체 활동</li><li class="p" aria-hidden="true">+</li><li><b>Brain</b>두뇌 발달</li><li class="p" aria-hidden="true">+</li><li><b>Social</b>사회성 발달</li></ul>'
            '<nav class="x-jump" aria-label="이 페이지에서 바로 가기">' + "".join(f'<a href="#{k}">{t}{ic("arr")}</a>' for k, t in jump) + '</nav></div>')
    return sec(f'<div class="two wide-l">{left}<div class="rv">{shot("k_balance", "낮은 평균대 위를 걷는 아이의 발")}</div></div>')


def _diff():
    old = ('<div class="box old rv"><small>대부분의 성장교육</small><h3>운동 중심의 일회성 수업</h3><p>아이의 상태를 정확히 알기 어렵습니다.</p>'
           '<ol class="x-rows"><li><b>운동</b><span>정해진 수업을 진행합니다</span></li><li class="end"><b>종료</b><span>변화를 확인하기 어렵습니다</span></li></ol></div>')
    rows = [("측정", "체성분 · 체형 · 체력 등 6대 측정"), ("분석", "데이터를 바탕으로 지금의 상태를 읽습니다"), ("맞춤 프로그램", "아이에게 맞는 프로그램을 설계합니다"),
            ("재측정 · 성장 관리", "주기적으로 다시 재며 변화를 살핍니다"), ("성장 리포트", "변화를 한눈에 확인합니다")]
    new = ('<div class="box new rv"><small>KIDSTEP SMART GROWTH CENTER</small><h3>데이터 기반 성장 관리 시스템</h3><p>아이의 성장 과정을 단계별로 관리합니다.</p>'
           '<ol class="x-rows">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in rows)
           + '<li class="end"><b>다음 성장 단계</b><span>다시 측정으로 돌아가 이어 갑니다</span></li></ol></div>')
    return sec(head("무엇이 다른가", "대부분의 성장교육은 운동만 합니다.<br><em>키즈스텝은 성장을 데이터로 관리합니다.</em>",
                    "데이터가 있어야 아이의 현재 상태를 이해하고, 맞는 방향을 정할 수 있습니다. 측정부터 분석, 맞춤 프로그램, 성장 관리까지 단계를 밟아 갑니다.")
               + f'<div class="vs x-vs">{old}<i aria-hidden="true">VS</i>{new}</div>'
               + '<p class="x-say rv"><span class="nb">측정이 <em>시작</em>이고,</span> <span class="nb">관리가 <em>성장</em>이며,</span> <span class="nb">데이터가 <em>방향</em>을 만듭니다.</span></p>', soft=True)


def _why():
    six = [("posture", "체형은 어떤가요?", "바른 자세와 균형을 확인합니다.", "체형 분석 · XBody"),
           ("scale", "체성분은 어떤가요?", "근육량 · 체지방량 등 체성분을 분석합니다.", "체성분 · InBody"),
           ("run", "체력은 어떤가요?", "근력 · 순발력 · 지구력 등 체력을 평가합니다.", "체력 측정 · 디딤 6대"),
           ("balance", "균형감각은 어떤가요?", "신체 균형과 협응 능력을 확인합니다.", ""),
           ("foot", "발바닥 아치는 어떤가요?", "발의 아치 형태와 체중 분포를 분석합니다.", ""),
           ("chart", "성장속도는 어떤가요?", "키와 몸의 성장 추이를 기록해 흐름을 살핍니다.", "")]
    cards = '<ul class="x-six rv">' + "".join(f'<li><i>{xi(k)}</i><b>{b}</b><span>{s}</span>{f"<em>{t}</em>" if t else ""}</li>' for k, b, s, t in six) + "</ul>"
    pic = (f'<div class="x-shot rv">{shot("k_measure", "측정 기기 위에 올라선 아이의 발", "tall")}'
           '<blockquote>“측정하지 않으면 좋아지고 있는지 <em>알 수 없습니다.</em>”</blockquote></div>')
    got = ["현재 상태 파악", "맞춤 프로그램 설계", "꾸준한 성장 관리", "변화를 눈으로 확인"]
    band = ('<div class="x-band rv"><div><h3>측정이 성장 관리의 첫걸음입니다</h3><p>객관적인 데이터는 아이의 강점과 보완할 점을 알려 주고, 맞춤 프로그램과 지속적인 관리의 기준이 됩니다.</p></div>'
            '<ul class="x-got">' + "".join(f'<li>{ic("check")}{x}</li>' for x in got) + "</ul></div>")
    return sec(head("6대 측정", "왜 <em>측정부터</em> 시작할까요?", "우리 아이의 현재 상태를 알아야 맞는 방향으로 성장을 도울 수 있습니다. 키즈스텝은 여섯 가지를 먼저 살핍니다.")
               + f'<div class="two wide-r x-why">{pic}{cards}</div>' + band, id="why")


def _system():
    st = [("MEASURE", "측정", ["체성분 <em>InBody</em>", "체형 분석 <em>XBody</em>", "체력 측정 <em>디딤 6대</em>", "발바닥 아치 분석", "균형 감각 측정", "성장 측정"]),
          ("ANALYZE", "분석", ["측정 데이터로 현재 상태 읽기", "아이의 강점과 성장 포인트", "영역별 종합 평가"]),
          ("PROGRAM", "맞춤 프로그램", ["성장 운동 <em>근력 · 유연성 · 체력</em>", "두뇌 발달 <em>인지 · 집중력 · 학습</em>", "사회성 발달 <em>협동 · 의사소통 · 리더십</em>", "보행 · 자세 관리 <em>체형 정렬 · 균형</em>", "생활 습관 관리 <em>수면 · 영양</em>"]),
          ("PROGRESS", "성장 관리", ["정기 측정과 데이터 업데이트", "성장 추이 살피기", "프로그램 점검과 피드백"]),
          ("REPORT", "성장 리포트", ["이전 · 현재 비교", "변화를 한눈에 확인", "보호자와 함께 공유"])]
    cy = '<ol class="cycle x-cy rv">' + "".join(f'<li><small>{s}</small><b>{b}</b><ul>' + "".join(f"<li>{x}</li>" for x in it) + "</ul></li>" for s, b, it in st) + "</ol>"
    loop = f'<p class="x-loop rv"><span>{xi("loop")}리포트 뒤에는 다시 측정 → 다음 성장 단계로 이어집니다</span></p>'
    say = '<p class="x-say rv"><em>데이터가 성장의 방향을 만듭니다.</em><small style="color:rgba(255,255,255,.8)">측정과 분석, 맞춤 프로그램과 꾸준한 관리로 아이의 성장을 돕습니다.</small></p>'
    return sec(head("키즈스텝 성장 시스템", "측정에서 리포트까지, <em>다섯 단계</em>", "한 번 재고 끝나는 것이 아니라, 다시 재고 비교하며 다음 단계로 이어 가는 순환 구조입니다.", center=True)
               + cy + loop + say, cls="sec-dark", id="system")


def _muscle():
    ms = [("run", "PHYSICAL MUSCLE", "신체 근육", ["운동", "균형 · 민첩성", "성장"], "다양한 움직임과 체계적인 운동으로 기초 체력과 움직임 능력을 기르고, 바른 자세와 자신감을 키웁니다."),
          ("bulb", "BRAIN MUSCLE", "두뇌 근육", ["인지 자극", "집중력", "학습 능력"], "몸을 움직이며 생각하고 집중하는 활동으로 주의력 · 기억력과 이해력 · 문제해결력의 바탕을 함께 다룹니다."),
          ("users", "SOCIAL MUSCLE", "사회성 근육", ["협동 활동", "배려 · 공감", "리더십"], "또래와 함께하는 활동을 통해 소통 · 배려 · 협동심을 키우고 건강한 관계를 만들어 갑니다.")]
    lis = "".join(f'<li class="rv"><i class="x-mi">{xi(k)}</i><small>{s}</small><b>{b}</b><div class="x-chain">' + "".join(f"<i>{c}</i>" for c in ch) + f'</div><span>{t}</span></li>' for k, s, b, ch, t in ms)
    keys = dl([("꾸준한 단련", "반복적인 자극과 노력으로 성장의 기초를 쌓습니다."),
               ("아이에게 맞는 자극", "측정과 분석을 바탕으로 아이에게 맞는 자극을 줍니다."),
               ("지속적인 성장", "단계별 관리로 아이의 성장을 꾸준히 이어 갑니다.")])
    return sec(head("세 가지 근육", "성장은 <em>단련</em>됩니다", "근육은 단련할수록 강해집니다. 체력도, 학습 능력도, 사회성도 그렇습니다. 성장은 반복적인 자극과 훈련을 통해 발달합니다.", center=True)
               + f'<ul class="muscle x-muscle">{lis}</ul>'
               + '<p class="x-say rv">이 세 가지를 <em>함께</em> 키우는 곳이 키즈스텝입니다.</p>'
               + f'<div class="two" style="margin-top:clamp(34px,4.4vw,60px)"><div class="rv">{shot("k_group", "큰 낙하산 천을 함께 들어 올리는 아이들의 뒷모습")}</div><div class="stack">{keys}{note("성장의 속도와 변화는 아이마다 다를 수 있습니다.")}</div></div>')


def _report():
    radar = ('<div class="x-radar" role="img" aria-label="체성분 · 체형 · 체력 · 균형 · 발 아치 · 성장 추이 여섯 영역을 이전과 현재로 겹쳐 보는 육각 그래프 구성 예시">'
             '<svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#e2e7ee" stroke-width="1.500">'
             '<path d="M100 20l69.300 40v80L100 180l-69.300-40V60z"/><path d="M100 46.700l46.200 26.600v53.400L100 153.300l-46.200-26.600V73.300z"/><path d="M100 73.300l23.100 13.400v26.600L100 126.700l-23.100-13.400V86.700z"/>'
             '<path d="M100 20v160M30.700 60l138.600 80M169.300 60L30.700 140"/></g>'
             '<path d="M100 60l33 22-2 37-31 25-35-24 3-40z" fill="rgba(107,119,134,.1)" stroke="#6b7786" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>'
             '<path d="M100 38l52 32-4 59-48 33-51-31 2-60z" fill="rgba(42,157,150,.2)" stroke="#2a9d96" stroke-width="3" stroke-linejoin="round"/></svg>'
             '<span class="a1">체성분</span><span class="a2">체형</span><span class="a3">체력</span><span class="a4">균형</span><span class="a5">발 아치</span><span class="a6">성장 추이</span></div>'
             '<ul class="x-legend" aria-hidden="true"><li class="prev">이전</li><li>현재</li></ul>')
    rows = [("이전과 현재 비교", "같은 조건에서 기록한 측정 결과를 나란히 살펴봅니다."), ("종합 성장 분석", "여섯 영역의 기록을 모아 전체 흐름을 확인합니다."),
            ("체성분 변화", "체중 · 골격근량 · 체지방률"), ("체력 영역별 비교", "순발력 · 근력 · 지구력 · 민첩성 · 유연성 · 평형성"),
            ("균형과 자세", "정적 균형 · 동적 균형 · 체형 기록"), ("발 아치와 체중 분포", "발의 형태와 압력 분포")]
    rep = ('<div class="x-report rv"><div class="x-rp-h"><b>KIDSTEP GROWTH REPORT</b><span>리포트 구성 예시</span></div><div class="x-rp-b">' + radar
           + '<ol class="x-rp-l">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in rows) + "</ol></div></div>")
    four = grid([box("데이터 기반 분석", "측정 항목을 모아 아이의 현재 상태를 이해합니다.", icon="chart", cls="teal"),
                 box("정기 측정과 비교", "누적된 기록으로 변화의 흐름을 살펴봅니다.", icon="cal", cls="teal"),
                 box("맞춤 성장 가이드", "아이에게 필요한 활동과 다음 목표를 정합니다.", icon="flag", cls="teal"),
                 box("부모와 함께 공유", "리포트를 함께 보며 성장 과정을 이야기합니다.", icon="users", cls="teal")], n=2)
    right = f'<div class="stack x-compact"><div class="rv">{shot("k_report", "성장 기록 그래프가 떠 있는 태블릿 화면")}</div>{four}</div>'
    return sec(head("성장 리포트", "기록으로 보는 <em>우리 아이의 변화</em>", "체성분 · 체형 · 체력 · 균형 · 발 아치 · 성장 추이까지, 측정 기록과 변화의 흐름을 한 장에 모아 보호자와 함께 봅니다.")
               + f'<div class="two top">{rep}{right}</div>'
               + f'<div style="margin-top:clamp(22px,2.6vw,36px)">{note("위 도식은 리포트가 어떻게 구성되는지 보여 주는 설명용 예시이며 실제 측정 결과가 아닙니다. 실제 리포트의 <span class=\"nb\">항목 · 양식</span>과 아이의 변화는 저마다 다를 수 있습니다.")}</div>',
               soft=True, id="report")


def _program():
    seven = [("run", "성장 운동", "기초 체력과 바른 자세 발달을 위한 맞춤 운동"), ("users", "사회성 발달", "또래와의 협동 활동으로 소통 · 배려 · 협력을 키웁니다"),
             ("bulb", "두뇌 발달", "규칙을 기억하고 상황을 판단하는 활동으로 집중과 문제 해결을 연습합니다"), ("ar", "디딤 AR", "AR 디지털 콘텐츠와 움직임을 결합한 스마트 운동"),
             ("heart", "체력 향상", "6대 체력 요소를 골고루 기릅니다"), ("star", "미래 역량", "자기 주도력 · 문제해결력 · 도전정신을 기릅니다"),
             ("chart", "데이터 관리", "데이터 수집과 분석으로 아이의 변화를 관리합니다")]
    sv = ('<ul class="x-seven rv">' + "".join(f'<li><i>{xi(k)}</i><b>{b}</b><span>{s}</span></li>' for k, b, s in seven)
          + '<li class="sum"><small>KIDSTEP</small><b>올인원 통합발달 프로그램</b><span>모든 성장은 연결되어 있습니다. 키즈스텝은 이 연결을 설계합니다.</span></li></ul>')
    progs = [("올인원 통합발달", "신체 활동과 인지 자극, 사회성 발달을 하나로 엮은 대표 프로그램입니다.", "01 · 성장 운동 + 두뇌 + 사회성", ["기초 체력 기르기", "두뇌 발달과 집중력", "협동 활동을 통한 사회성 발달"]),
             ("소그룹 프로그램", "소규모 그룹에서 아이의 성향과 속도에 맞춰 자신감을 키웁니다.", "02 · 소수 정예 맞춤 성장", ["개인별 밀착 케어", "사회성과 의사소통 능력", "심리적 안정감과 자신감"]),
             ("사회성 프로그램", "또래 관계, 의사소통, 배려와 협동을 통해 건강한 사회성을 기릅니다.", "03 · 관계의 힘을 키우는 수업", ["또래 관계 능력", "배려 · 공감 · 소통 훈련", "문제해결력과 협동심"]),
             ("디딤 AR 프로그램", "AR 기술과 디딤 장비를 활용해 몰입감 있는 스마트 운동을 경험합니다.", "04 · AR 기반 스마트 운동", ["AR 인터랙티브 콘텐츠", "균형감각과 반응 속도", "재미와 몰입으로 즐기는 운동"]),
             ("성장평가 프로그램", "정기적인 측정과 분석으로 아이의 성장 변화를 확인합니다.", "05 · 정기 평가와 성장 관리", ["체성분 · 체형 · 체력 통합 측정", "데이터 기반 성장 분석", "맞춤 성장 가이드 제공"])]
    cards = [box(t, p, small=s, items=it) for t, p, s, it in progs]
    cards.append(box("유아부 4 ~ 7세<br>초등부 8 ~ 13세", "두 그룹으로 나누어 연령 통합 수업으로 진행합니다. 반 편성과 수업 시간은 전화로 안내해 드립니다.", small="수업 대상", cls="dark")
                 .replace("</div>", f'<p style="margin-top:20px"><a class="btn btn-lime btn-sm" href="tel:{TEL.replace("-", "")}">{ic("tel")}{TEL}</a></p></div>', 1))
    return sec(head("올인원 통합발달", "신체 · 두뇌 · 사회성을 <em>한 커리큘럼</em>으로", "성장에 필요한 요소를 하나의 커리큘럼 안에 엮어, 아이들이 즐겁게 움직이고 생각하고 함께하며 균형 있게 자라도록 돕습니다.")
               + sv
               + f'<div class="x-sub rv" style="margin-top:clamp(44px,5.4vw,80px)"><h3 class="h3">키즈스텝 프로그램 5종</h3><p>아이의 성장 단계와 성향에 맞춰 고를 수 있습니다.</p></div>' + grid(cards), id="program")


def _people():
    def person(role, name, line, certs, face):
        return (f'<li class="x-person rv"><div class="x-pt"><span class="x-face">{face}</span><small>{role}</small><h3>{name}</h3></div><p>{line}</p>'
                '<ul>' + "".join(f"<li>{c}</li>" for c in certs) + "</ul></li>")
    ppl = [person("대표", "이유진", "아이의 성장을 위한 전문성과 진심으로 함께합니다.",
                  ["루터대학교 재활복지대학원 졸업 · 전 학기 수석 (언어치료학 석사)", "아동발달과 교육을 위한 음악치료교육 이수", "한국언어재활사협회 정회원", "뉴로피드백(Neuro-Feedback Therapy) 치료사",
                   "감각운동통합 훈련(Interactive Metronome Therapy) 치료사", "연세대학교 미래교육원 응용행동분석 전문가 과정(ABA) 수료", "1급 언어재활사", "인지학습치료사 2급", "스피치 지도사 3급"],
                  img("director", "이유진 대표")),
           person("센터장", "선호세", "다양한 신체 활동으로 아이의 도전과 성장을 함께합니다.",
                  ["유아체육 지도자", "유소년 스포츠 지도자", "유소년 농구 · 축구 지도자", "태권도 4단 · 합기도 5단", "태권도 · 합기도 심판 자격증", "음악줄넘기 지도자 1급", "유소년 인라인 지도자", "대한 밸런스 의학회 수료증"], xi("run")),
           person("실장", "이동건", "아이의 움직임과 발달 단계에 맞춘 활동을 지도합니다.",
                  ["유아체육 지도자", "유소년 스포츠 지도자", "생활체육 지도자 3급", "농구 심판 자격증", "스포츠 마사지", "카이로프랙틱", "캉구점프 지도자", "대한 밸런스 의학회 수료증"], xi("run"))]
    return sec(head("함께하는 사람", "체육 · 언어 · 발달 분야의 <em>자격을 갖춘 사람들</em>", "아이의 성장을 이해하고 함께 이끄는 팀입니다. 정기적인 내부 교육과 외부 연수로 지도 역량을 쌓아 갑니다.")
               + f'<ul class="people">{"".join(ppl)}</ul>'
               + f'<div style="margin-top:clamp(22px,2.6vw,36px)">{note("위 목록은 각 지도자가 보유한 <span class=\"nb\">자격 · 수료</span> 내역입니다. 키즈스텝의 수업은 운동과 성장 관리 프로그램으로 진행합니다.")}</div>', soft=True, id="people")


def _care():
    safe = grid([box("안전한 시설", "충격 흡수 바닥재, 안전 설비, 정기 안전 점검으로 사고 예방에 힘씁니다.", icon="shield"),
                 box("공기 · 위생 관리", "공기청정 시스템과 주기적인 소독으로 쾌적한 환경을 유지합니다.", icon="leaf"),
                 box("CCTV · 출입 관리", "전 구역 CCTV 모니터링과 출입 관리 시스템으로 안전을 살핍니다.", icon="home"),
                 box("응급 대응 체계", "응급처치 교육 이수와 비상 연락망으로 신속하게 대응합니다.", icon="heart")], n=4)
    parent = grid([box("부모 교육 세미나", "성장 · 자세 · 사회성 발달을 이해하는 교육을 제공합니다.", icon="book", cls="teal"),
                   box("부모 상담 · 코칭", "아이의 성장 단계에 맞춘 상담과 양육 코칭을 합니다.", icon="talk", cls="teal"),
                   box("가정 연계 가이드", "가정에서 실천할 수 있는 운동 · 생활 습관을 안내합니다.", icon="home", cls="teal"),
                   box("부모 커뮤니티", "정보 공유와 소통을 위한 온 · 오프라인 커뮤니티를 운영합니다.", icon="users", cls="teal")], n=4)
    part = [("킨더윌", "사회성 프로그램 협력"), ("디딤 DIDIM", "신체 · 뇌 훈련 프로그램 협력"), ("엑스바디 exbody", "체형 측정 시스템"), ("인바디 InBody", "체성분 분석")]
    partners = '<ul class="partners rv">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in part) + "</ul>"
    sub = lambda eb, h, p: f'<div class="x-sub rv"><span class="eb">{eb}</span><h3 class="h3" style="margin-top:10px">{h}</h3><p>{p}</p></div>'
    return sec('<div class="stack-lg x-compact">'
               + f'<div>{sub("SAFETY", "안전과 위생", "아이들이 안심하고 활동할 수 있도록 시설과 운영 환경을 함께 관리합니다.")}{safe}</div>'
               + f'<div>{sub("PARENT CARE", "부모 케어 프로그램", "아이와 부모가 함께 성장하는 공간 — 부모의 이해와 참여가 아이의 성장 경험을 일상으로 이어 줍니다.")}{parent}</div>'
               + f'<div>{sub("PARTNERS", "함께하는 곳", "측정과 프로그램을 아래 기관 · 장비와 함께합니다.")}{partners}</div></div>', id="care")


def _visit():
    b = BR["ks"]; t = TEL.replace("-", "")
    info = dl([("주소", f'{b["addr"]} {b["addr2"]}<br>킨더윌 3센터와 같은 건물(대명빌딩 4층)입니다.'), ("전화", f'<a href="tel:{t}">{TEL}</a>'),
               ("수업 대상", "유아부 4 ~ 7세 · 초등부 8 ~ 13세"), ("운영 시간 · 수업료", "전화로 안내해 드립니다."),
               ("홈페이지", f'<a href="{KIDSTEP_URL}" target="_blank" rel="noopener">kidstep.co.kr</a> (새 창)')])
    act = (f'<div class="cen-act rv"><a class="btn btn-ink" href="tel:{t}">{ic("tel")}{TEL}</a>{btn("상담 문의하기", href("contact"))}'
           f'<a class="btn btn-line" href="{KIDSTEP_URL}" target="_blank" rel="noopener">키즈스텝 홈페이지{ic("ext")}</a></div>')
    mp = (f'<div class="cen-map rv"><iframe data-map data-addr="{b["addr"]}" data-name="{b["name"]}" title="키즈스텝 위치 지도" loading="lazy"></iframe></div>')
    return sec(head("오시는 길 · 문의", "키즈스텝 <em>노원</em>", "성장 측정과 프로그램 상담은 전화로 먼저 문의해 주세요. 방문 일정을 안내해 드립니다.")
               + f'<div class="two top x-loc"><div class="stack">{info}{act}</div>{mp}</div>', soft=True, id="visit")


def pages():
    inner = _intro() + _diff() + _why() + _system() + _muscle() + _report() + _program() + _people() + _care() + _visit()
    return [("kidstep", subpage("kidstep", "키즈스텝 스마트성장센터", "아이의 성장을 측정하고, 분석하고, 관리합니다.<br>Body + Brain + Social — 몸과 두뇌와 사회성이 함께 자라는 스마트 성장센터.", inner,
                                bg="k_hero", body_cls="ks-page", ph_cls="ks-ph",
                                desc="키즈스텝 스마트성장센터 — 6대 측정에서 분석 · 맞춤 프로그램 · 성장 관리 · 성장 리포트까지, 아이의 성장을 데이터로 관리합니다. 서울 노원구 상계로27길 32 대명빌딩 401호, 02-936-3421."))]
