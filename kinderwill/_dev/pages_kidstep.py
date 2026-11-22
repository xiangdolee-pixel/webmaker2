from kit import *
"""키즈스텝스마트성장센터 한 쪽 — kidstep.co.kr 의 구간 순서(A 첫 화면 → B 왜 측정부터 → C 데이터로 관리 → D 성장은 단련됩니다 → E 성장 시스템 → F 여섯 가지 경험
   → G 올인원 통합발달 → H 프로그램 · 여정 → (수업 안내) → I 성장 리포트 → J 센터 소개 → K 부모 · 협력사 · 상담 → 오시는 길 → 성장스토리)와 문장을 뼈대로 다시 짠 것.
   원자료: _pc/kinderwill/kidstep/KIDSTEP.md. 그림은 새로 만든 k_* 만(그 사이트 그림은 쓰지 않는다), 도표는 HTML/CSS/SVG.
   전용 모양(.x-…)은 css/style.css 끝의 'extra_kidstep 시작 ~ 끝' 사이.
   싣지 않은 것: 견본 후기 3개, 지난 행사(무료 성장검사), 게시글의 효과 단정 · 자가 진단, 수업료 · 수업 길이 · 정원(자료 없음 → 전화 안내)."""

TEL = BR["ks"]["tel"]; T = TEL.replace("-", "")
BOARD = KIDSTEP_URL + "/29"
KBLOG = "https://blog.naver.com/kidstep3421"
KINSTA = "https://www.instagram.com/kidstep_smart.growth.center"
TALK = "https://talk.naver.com/ct/wrwfm83"
LOOP = svg('<path d="M20 12a8 8 0 0 1-13.700 5.700M4 12a8 8 0 0 1 13.700-5.700"/><path d="M17.500 2.500v4h-4M6.500 21.500v-4h4"/>')
EX = '<span class="x-ex">예시</span>'
LOGO = img("ks/logo-kidstep.webp", "키즈스텝 스마트성장센터")


def en(s): return f'<small class="x-en">{s}</small>'
def words(items): return '<ul class="x-words">' + "".join(f"<li>{x}</li>" for x in items) + "</ul>"
def end(h, p="", ws=None, logo=False):
    """구간 맺음 띠 — 한 문장 결론 + 낱말 몇 개"""
    right = words(ws) if ws else (f'<span class="x-chip">{LOGO}</span>' if logo else "")
    return f'<div class="x-end rv"><div><h3>{h}</h3>{f"<p>{p}</p>" if p else ""}</div>{right}</div>'
def sw(inner, label, wide=False):
    """폰(wide=True 면 태블릿까지)에서는 옆으로 넘기는 줄 — 안의 .x-sc 가 넘어간다"""
    return (f'<div class="x-sw{" wide" if wide else ""} rv" role="group" aria-label="{label}"><p class="x-tip" aria-hidden="true">옆으로 넘겨 보세요{ic("arr")}</p>{inner}</div>')
def sub(h, p="", eb=""):
    return f'<div class="x-sub rv">{f"<span class=\"eb\">{eb}</span>" if eb else ""}<h3 class="h3">{h}</h3>{f"<p>{p}</p>" if p else ""}</div>'
def item(e_, b, strong, span, tags=""):
    return f'<li>{en(e_) if e_ else ""}<b>{b}</b><strong>{strong}</strong><span>{span}</span>{f"<em class=\"x-tags\">{tags}</em>" if tags else ""}</li>'


# ── A. 첫 화면
def _intro():
    jump = [("why", "스마트성장"), ("system", "성장시스템"), ("program", "프로그램"), ("report", "성장리포트"), ("center", "센터소개"), ("consult", "상담예약"), ("story", "성장스토리")]
    left = (f'<div class="rv"><span class="x-logo">{LOGO}</span>'
            '<p class="x-big">아이의 성장을<br><span>측정하고,</span><br><span>분석하고,</span><br><em>관리합니다.</em></p>'
            '<ul class="x-bbs" aria-label="키즈스텝이 함께 다루는 세 가지"><li><b>신체활동</b><small>Physical Activity</small></li><li class="p" aria-hidden="true">+</li>'
            '<li><b>두뇌발달</b><small>Brain Development</small></li><li class="p" aria-hidden="true">+</li><li><b>사회성 발달</b><small>Social Development</small></li></ul></div>')
    right = (f'<div class="x-intro-pic">{figure("k_hero", "STEP BY STEP — 자라는 모든 순간에.", alt="사다리 모양 교구를 따라 달리는 아이들의 뒷모습", cls="arch dot", lazy=False)}'
             '<ol class="x-cap2 rv"><li>성장 측정</li><li>꼼꼼한 성장 관리</li></ol></div>')
    nav = '<nav class="x-jump rv" aria-label="이 페이지에서 바로 가기">' + "".join(f'<a href="#{k}">{t}</a>' for k, t in jump) + "</nav>"
    return sec(f'<div class="x-intro">{left}{right}</div>{nav}', id="smart")


# ── B. 왜 측정부터 시작할까요
def _why():
    six = [("POSTURE", "체형과 자세", "바르게 서고 있나요?", "아이의 자세와 신체 정렬을 살펴보고, 균형 상태를 확인합니다.", "자세 · 신체 균형"),
           ("BODY COMPOSITION", "체성분", "몸은 어떻게 구성되어 있나요?", "근육량과 체지방량 등 체성분을 분석해 아이의 현재 상태를 살펴봅니다.", "근육량 · 체지방량"),
           ("PHYSICAL FITNESS", "운동능력", "얼마나 힘차게 움직이나요?", "근력, 순발력, 지구력 등을 평가해 아이의 기초 체력을 알아봅니다.", "근력 · 순발력 · 지구력"),
           ("GROWTH &amp; BALANCE", "성장과 균형", "얼마나 자라고, 잘 균형 잡나요?", "키와 몸무게를 측정하고, 신체 균형과 협응 능력을 확인합니다.", "키 · 몸무게 · 협응 능력"),
           ("FOOT ANALYSIS", "발과 아치", "두 발로 고르게 지지하나요?", "발의 아치 형태와 체중 분포를 분석해 몸을 지지하는 발의 상태를 살펴봅니다.", "발 아치 · 체중 분포"),
           ("GROWTH TRACKING", "성장 추이", "어떤 속도로 자라고 있나요?", "측정 기록을 비교하며 성장의 흐름을 읽고, 앞으로의 관리 방향을 세웁니다.", "성장 기록 · 변화 확인")]
    say = '<blockquote class="x-say rv"><p>측정하지 않으면<br>좋아지고 있는지<br><em>알 수 없습니다.</em></p></blockquote>'
    lst = '<ol class="x-six rv">' + "".join(item(*x) for x in six) + "</ol>"
    gear = [("k_measure", "측정 기기 발판에 올라선 아이와 태블릿으로 기록하는 지도자", "체성분", "InBody J50", "유아 · 소아청소년 전용 체성분 분석기입니다. 신장계 일체형이라 발판에 올라서면 키와 체성분을 함께 재고, 부위별 근육 발달과 성장 곡선을 결과지로 확인합니다."),
            ("k_posture", "체형 측정 기기 앞에 바르게 선 아이의 뒷모습", "체형 분석", "엑스바디 770", "체형분석기로 자세와 신체 정렬을 살펴봅니다. 관절 위치를 인식해 척추 · 골반의 좌우 균형을 수치로 기록하고, 이전 측정과 비교합니다."),
            ("k_foot", "발바닥 압력판 위에 맨발로 선 아이와 화면의 족압 분포", "발 아치 · 족압", "엑스바디 아치파인더", "맨발로 올라서면 발바닥을 스캔해 아치 상태와 족압(체중) 분포, 좌우 균형을 살펴봅니다.")]
    did = ["제자리 멀리 뛰기", "왕복 달리기", "스퀘어", "레그 스트레칭", "외발서기", "버피 테스트"]
    gl = "".join(f'<li><div class="x-gp">{img(n, a)}</div><div>{en(s)}<b>{b}</b><span>{t}</span></div></li>' for n, a, s, b, t in gear)
    gl += ('<li class="dd"><div class="x-gp t" role="img" aria-label="디딤 측정 6종목: ' + ", ".join(did) + '">' + "".join(f"<i>{x}</i>" for x in did) + "</div>"
           f'<div>{en("운동 능력")}<b>디딤(DIDIM) 스마트 교구</b><span>매주 하나씩, 6가지 종목을 측정합니다. 모두 마치면 아이의 연령과 성별을 기준으로 한 종합 운동평가 결과지'
           '(심폐지구력, 협응력, 순발력, 근력 · 근지구력, 평형성, 유연성)를 드립니다.</span></div></li>')
    return sec(head("성장의 시작은, 정확히 아는 것부터.", "왜 측정부터 <em>시작할까요?</em>", "우리 아이의 현재 상태를 정확히 알아야 아이에게 맞는 성장 방향을 세울 수 있습니다.")
               + f'<div class="x-why">{say}{lst}</div>'
               + sub("측정 장비", "여섯 영역은 아래 장비로 잽니다.") + f'<ul class="x-gear rv">{gl}</ul>'
               + end("정확한 측정이 성장의 첫걸음입니다.", "측정 데이터로 아이의 강점과 보완점을 파악하고, 맞춤 프로그램과 지속적인 관리의 기준을 세웁니다.", ["현재 상태 파악", "맞춤 성장 관리", "변화를 눈으로 확인"]),
               soft=True, id="why")


# ── C. 성장을 데이터로 관리합니다
def _data():
    st = [("측정", "아이의 현재 상태를 정확하게", "체성분, 체형, 체력 등 6가지 영역을 측정합니다."),
          ("분석", "데이터로 강점과 보완점 찾기", "측정 결과를 바탕으로 아이의 상태를 분석합니다."),
          ("맞춤 통합 발달 프로그램", "우리 아이에게 맞는 활동으로", "분석 결과에 맞춰 스마트 성장체육 프로그램을 제공합니다."),
          ("재측정과 성장 관리", "변화를 확인하고 방향 조정하기", "주기적인 측정으로 변화를 추적하고 관리에 반영합니다."),
          ("성장 리포트", "성장의 과정을 한눈에", "측정 기록과 변화 추이를 이해하기 쉽게 확인합니다."),
          ("다음 성장 단계", "다음 목표를 향해 한 걸음 더", "변화에 맞춰 목표와 프로그램을 조정합니다.")]
    old = ('<div class="x-old rv"><small>운동 중심의 수업</small><h3>운동하고,<br>수업을 마칩니다.</h3><p>측정과 기록이 없다면 성장의 변화를 확인하기 어렵습니다.</p>'
           '<ol aria-label="운동 중심 수업의 흐름"><li>활동 참여</li><li>운동 수업</li><li class="end">수업 종료</li></ol><p>수업 이후의 변화를 확인할 측정 기록이 필요합니다.</p></div>')
    new = (f'<div class="x-new rv"><div class="x-new-h"><small>데이터 기반 성장 관리</small><span class="x-chip">{LOGO}</span></div><h3>알고, 맞추고, 다시 확인합니다.</h3>'
           + sw('<ol class="x-st x-sc" tabindex="0">' + "".join(f'<li{" class=\"last\"" if i == 5 else ""}><small>STEP 0{i + 1}</small><b>{b}</b><em>{m}</em><span>{s}</span></li>' for i, (b, m, s) in enumerate(st)) + "</ol>", "데이터 기반 성장 관리 여섯 단계")
           + f'<p class="x-loop">{LOOP}다음 단계에서도 측정부터, 관리는 계속됩니다.</p></div>')
    return sec(head("운동을 넘어, 성장의 과정까지.", "키즈스텝은 성장을 <em>데이터로 관리합니다.</em>",
                    "측정부터 분석, 맞춤 프로그램, 성장 관리까지. <b>아이의 현재를 알고, 다음 성장을 준비합니다.</b> 핵심은 꾸준히 쌓이는 데이터입니다.")
               + f'<div class="x-vs">{old}{new}</div>'
               + end("측정이 시작이고, 꾸준한 관리가 성장의 바탕입니다.", "데이터로 아이의 현재를 이해하고, 아이에게 맞는 방향으로 성장의 과정을 함께합니다."), id="system")


# ── D. 성장은 단련됩니다
def _train():
    tri = [("PHYSICAL DEVELOPMENT", "신체 발달", "힘 있게 움직이는 몸", [("기초 체력", "다양한 대 · 소근육 활동"), ("균형과 민첩성", "몸의 균형과 협응 연습"), ("움직임의 자신감", "바른 자세와 동작 익히기")],
            "다양한 움직임을 반복하며 체력과 움직임의 기초를 차근차근 쌓습니다."),
           ("COGNITIVE DEVELOPMENT", "두뇌 발달", "생각하며 움직이는 힘", [("인지 자극", "상황을 보고 판단하기"), ("집중과 조절", "규칙을 기억하고 실행하기"), ("문제 해결", "새로운 방법으로 도전하기")],
            "몸과 생각을 함께 쓰는 활동으로 집중하고 판단하는 경험을 넓힙니다."),
           ("SOCIAL DEVELOPMENT", "사회성 발달", "함께 자라는 마음", [("협동 활동", "친구와 목표 함께 이루기"), ("배려와 공감", "차례와 약속 지키기"), ("책임과 리더십", "역할을 맡고 끝까지 해보기")],
            "또래와 소통하고 협력하며 배려와 책임감을 연습합니다.")]
    cols = "".join(f'<li>{en(f"0{i + 1} · {e_}")}<h3>{b}</h3><strong>{s}</strong><ol>' + "".join(f"<li><b>{x}</b><span>{y}</span></li>" for x, y in it) + f"</ol><p>{p}</p></li>"
                   for i, (e_, b, s, it, p) in enumerate(tri))
    three = rows([("꾸준한 훈련", "작은 도전과 반복을 일상의 성장 경험으로 쌓습니다."), ("아이에게 맞는 자극", "측정과 분석을 바탕으로 현재 단계에 맞는 활동을 구성합니다."),
                  ("지속적인 성장 관리", "변화를 확인하며 다음 목표와 도전을 함께 정합니다.")])
    proof = ('<div class="x-proof rv"><h3>신체활동의 가치를<br>뒷받침하는 근거</h3><div><p>WHO는 아동 · 청소년의 신체활동이 체력, 뼈 건강, 인지 기능 및 정신 건강에 이점을 제공한다고 설명합니다. '
             '키즈스텝은 몸을 움직이고, 생각하고, 함께하는 활동을 통해 균형 있는 발달 경험을 설계합니다.</p>'
             f'<a href="https://www.who.int/publications/i/item/9789240015128" target="_blank" rel="noopener">WHO 신체활동 및 좌식생활 가이드라인 (2020){ic("ext")}</a>'
             '<small>일반적인 신체활동에 관한 근거이며, 특정 프로그램의 효과를 보장하는 자료는 아닙니다. 개인의 발달과 변화에는 차이가 있습니다.</small></div></div>')
    return sec(head("몸도, 생각도, 마음도 함께.", "성장은 <em>단련됩니다.</em>", "신체 발달도, 두뇌 발달도, 사회성 발달도. <b>반복적인 자극과 훈련</b>으로 성장의 기초를 쌓습니다.")
               + f'<div class="two wide-r">{figure("k_five", "함께 자라는 즐거움", alt="지도자와 손바닥을 마주치는 아이의 손", cls="arch dot")}<div>{three}</div></div>'
               + sw(f'<ul class="x-tri x-sc" tabindex="0">{cols}</ul>', "신체 · 두뇌 · 사회성 발달")
               + end("세 가지 성장을, 하나의 프로그램으로.", "신체 · 두뇌 · 사회성의 균형 있는 발달을 함께합니다.", logo=True) + proof, soft=True, id="train")


# ── E. 성장 시스템 (다섯 단계) — 작은 도표는 모두 설명용 예시
def _steps():
    m1 = '<ul class="x-m6">' + "".join(f"<li><i>0{i + 1}</i>{x}</li>" for i, x in enumerate(["체성분", "체형", "체력", "균형", "발 아치", "성장"])) + "</ul>"
    m2 = ('<svg class="x-msv" viewBox="0 0 120 108" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"><path d="M60 6l41.600 24v48L60 102 18.400 78V30z"/><path d="M60 30l20.800 12v24L60 78 39.200 66V42z"/>'
          '<path d="M60 6v96M18.400 30l83.200 48M101.600 30L18.400 78"/></g><path d="M60 18l33 17-7 37-26 20-30-21 3-36z" fill="rgba(201,242,107,.22)" stroke="#c9f26b" stroke-width="2.500" stroke-linejoin="round"/></svg>'
          '<p class="x-mt"><span>강점 확인</span><span>보완점 파악</span></p>')
    m3 = '<ul class="x-mc"><li>신체 · 두뇌 · 사회성</li><li>보행과 자세</li><li>수면 · 영양 · 생활 습관</li></ul>'
    m4 = ('<svg class="x-msv" viewBox="0 0 160 84" aria-hidden="true"><path d="M6 78h148M6 54h148M6 30h148" stroke="rgba(255,255,255,.2)" stroke-width="1"/>'
          '<path d="M8 66l36-8 36-4 36-14 36-6" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2.500" stroke-linecap="round" stroke-linejoin="round"/>'
          '<path d="M8 72l36-14 36-12 36-18 36-16" fill="none" stroke="#c9f26b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          '<p class="x-mt"><span>측정</span><span>피드백</span><span>조정</span></p>')
    m5 = '<div class="x-mp"><small>GROWTH REPORT</small><b>성장 기록</b><p><span>이전 기록</span><i aria-hidden="true"></i><span>현재 기록</span></p></div>'
    st = [("MEASURE", "정확한 측정", "아이의 현재를 알아봅니다.", "체성분, 체형, 체력, 균형, 발 아치, 성장 등 여섯 영역을 살펴봅니다.", m1, "6가지 측정 영역"),
          ("ANALYZE", "데이터 분석", "강점과 보완점을 찾습니다.", "측정 결과를 함께 살펴보고 아이에게 필요한 성장 방향을 정합니다.", m2, "이해를 돕기 위한 예시"),
          ("PROGRAM", "맞춤 프로그램", "아이에게 맞게 구성합니다.", "신체 · 두뇌 · 사회성 활동과 자세, 생활 습관 관리를 함께 설계합니다.", m3, "프로그램 구성 예시"),
          ("PROGRESS", "지속적인 관리", "변화에 맞춰 조정합니다.", "정기적인 측정과 기록으로 변화를 추적하고 프로그램에 반영합니다.", m4, "이해를 돕기 위한 예시"),
          ("REPORT", "성장 리포트", "성장의 과정을 공유합니다.", "이전과 현재의 기록을 비교하며 변화와 다음 목표를 확인합니다.", m5, "이해를 돕기 위한 예시")]
    lis = "".join(f'<li>{en(e_)}<b>{b}</b><strong>{s}</strong><span>{t}</span><div class="x-mini"><div>{m}</div><p>{c}</p></div></li>' for e_, b, s, t, m, c in st)
    flow = '<p class="x-flow rv">' + "".join(f"<span>{x}</span>" for x in ["측정", "분석", "프로그램", "성장 관리", "리포트"]) + "</p>"
    return sec(head("아이의 성장을 이어가는 다섯 단계.", "키즈스텝 <em>성장 시스템</em>", "정확히 알고, 아이에게 맞추고, 변화를 확인합니다. 데이터를 바탕으로 성장의 과정을 체계적으로 관리합니다.", center=True)
               + flow + sw(f'<ol class="x-five x-sc" tabindex="0">{lis}</ol>', "성장 시스템 다섯 단계", wide=True)
               + '<p class="x-fine rv">도표와 리포트는 설명용 예시이며, 실제 측정 결과와 제공 양식은 다를 수 있습니다.</p>', tone="navy", id="steps")

def _scene():
    return ('<section class="scene x-scene"><div class="scene-i">' + img("k_balance", "낮은 평균대 위를 걷는 아이의 발과 곁에서 손을 내민 지도자") + '</div>'
            '<div class="wrap"><blockquote class="scene-tx rv"><p>데이터가 성장의<br><em>방향</em>을 만듭니다.</p>'
            '<div class="x-scene-p">측정과 분석, 맞춤 프로그램과 꾸준한 관리로 아이의 현재에서 다음 성장으로 이어갑니다.</div>'
            + words(["현재를 이해하고", "맞춤 활동을 설계하고", "다음 성장을 준비합니다"]) + '</blockquote></div></section>\n')


# ── F. 여섯 가지 경험이 하나의 성장으로
def _six():
    L = [("GROWTH FOUNDATION", "키 성장", "건강한 성장의 기초", "뼈와 근육을 사용하는 다양한 움직임으로 건강한 신체 활동의 기초를 쌓습니다.", "성장 기반 · 신체 활동"),
         ("MOTOR DEVELOPMENT", "대 · 소근육 발달", "크고 작은 움직임을 섬세하게", "온몸을 쓰는 활동과 손의 정교한 움직임을 통해 자기조절과 협응을 연습합니다.", "자기조절 · 정교한 움직임"),
         ("EVERYDAY MOVEMENT", "필수 생활체육", "일상에서 즐기는 움직임", "걷고, 뛰고, 던지고, 받는 기본 동작을 익히며 몸을 조절하는 경험을 넓힙니다.", "기본 동작 · 신체조절")]
    R = [("COGNITIVE DEVELOPMENT", "두뇌 발달", "생각과 움직임을 함께", "규칙을 기억하고 상황을 판단하는 활동으로 주의집중과 문제 해결을 연습합니다.", "주의집중 · 상황 판단"),
         ("SOCIAL DEVELOPMENT", "사회성 향상", "친구와 함께하는 경험", "같은 목표에 집중하고 차례를 기다리며 서로 협력하는 방법을 배웁니다.", "공동 주의집중 · 협동 · 기다리기"),
         ("CONFIDENCE", "자신감 향상", "작은 성공이 다음 도전으로", "해냈다는 경험을 쌓으며 자신을 긍정적으로 바라보고 새로운 활동에 도전합니다.", "긍정적 자아 · 성공 경험 · 도전")]
    hub = (f'<div class="x-hub rv"><ul class="x-hub-l">{"".join(item(*x) for x in L)}</ul>'
           f'<div class="x-hub-c"><span class="x-chip">{LOGO}</span><small>함께 키우는 성장의 기초</small><p>서로 연결되어 <br>균형 있게 <br>자랍니다.</p></div>'
           f'<ul class="x-hub-r">{"".join(item(*x) for x in R)}</ul></div>')
    return sec(head("몸도, 생각도, 관계도 함께.", "여섯 가지 경험이 <em>하나의 성장으로.</em>", "움직임에서 생각으로, 함께하는 경험에서 자신감으로. 키즈스텝은 서로 연결되는 성장의 기초를 쌓습니다.", center=True)
               + hub + end("작은 움직임과 도전이 쌓여, 아이의 다음 성장을 준비합니다."), soft=True, id="program")


# ── G. 올인원 통합발달 프로그램 (일곱 가지)
def _seven():
    sv = [("GROWTH ACTIVITY", "성장 운동", "즐겁게 움직이며 성장의 기초를 쌓습니다.", "스마트 성장체육으로 다양한 움직임을 경험하고, 기초 체력과 자기조절을 연습합니다.", "움직임 · 자기조절"),
          ("PHYSICAL FITNESS", "체력 향상", "다양한 체력 요소를 고르게 연습합니다.", "근력, 지구력, 유연성, 균형 등 아이의 단계에 맞는 활동으로 체력의 기초를 다집니다.", "기초 체력 · 균형"),
          ("COGNITIVE DEVELOPMENT", "두뇌 발달", "몸과 생각을 함께 사용합니다.", "규칙을 기억하고 상황을 판단하는 활동으로 집중과 문제 해결을 연습합니다.", "집중 · 문제 해결"),
          ("SOCIAL DEVELOPMENT", "사회성 발달", "친구와 함께하는 방법을 배웁니다.", "또래와 협력하고 차례와 약속을 지키며 소통, 배려, 협동을 경험합니다.", "소통 · 배려 · 협동"),
          ("AR SMART COACHING", "AR 스마트 코칭", "화면 속 미션이 신체활동으로 이어집니다.", "증강현실 기술을 접목한 활동으로 움직이고, 판단하고, 함께 도전하는 경험을 제공합니다.", "실감형 활동 · 참여"),
          ("DATA MANAGEMENT", "데이터 관리", "변화를 기록하고 다음 방향을 찾습니다.", "측정 데이터를 모으고 비교하며 아이의 변화를 확인하고 프로그램에 반영합니다.", "측정 · 분석 · 피드백"),
          ("FUTURE SKILLS", "미래 역량", "스스로 도전하고 끝까지 해봅니다.", "목표를 정하고 새로운 방법을 시도하며 자기주도성과 도전하는 태도를 연습합니다.", "자기주도 · 도전")]
    lst = ('<ol class="x-seven x-sc" tabindex="0">' + "".join(item(*x) for x in sv)
           + '<li class="sum"><small>KIDSTEP</small><b>일곱 가지 경험,<br>하나의 성장 과정.</b><span>아이에게 필요한 경험을 하나의 커리큘럼 안에 연결합니다.</span></li></ol>')
    return sec(split(head("일곱 가지 경험, 하나의 성장 과정.", "올인원 통합발달 <em>프로그램</em>",
                          "<b>신체 · 두뇌 · 사회성을 함께 깨우는 성장 경험.</b> 즐겁게 움직이고, 생각하고, 함께하는 활동에 데이터 관리를 더합니다.", kind="stack"),
                     sw(lst, "올인원 통합발달 프로그램의 일곱 가지")), id="allinone")


# ── H. 키즈스텝 프로그램 (네 가지) + 성장 여정
def _program():
    pg = [("k_group", "큰 낙하산 천을 함께 들어 올리는 아이들의 뒷모습", "ALL-IN-ONE", "올인원 통합발달", "성장 운동 + 두뇌 + 사회성", "신체활동과 인지 자극, 또래와의 협동을 하나로 연결한 통합 프로그램입니다.",
           ["움직임을 통한 자기조절 연습", "인지 활동과 집중 경험", "협동과 소통 활동", "AR을 활용한 신체활동"]),
          ("k_small", "지도자를 따라 낮은 허들 사이를 걷는 아이 세 명의 뒷모습", "SMALL GROUP", "소그룹 프로그램", "아이의 속도에 맞춘 성장", "소규모 그룹에서 아이의 성향과 발달 단계에 맞춰 함께 배우고 도전합니다.",
           ["또래와의 상호작용", "작은 성공과 자신감 쌓기", "감정 표현과 의사소통 연습"]),
          ("k_ar", "바닥에 비친 빛 무늬를 밟으며 움직이는 아이들의 발", "AR SMART ACTIVITY", "AR 스마트 운동", "움직임으로 참여하는 미션", "실감형 AR 콘텐츠를 활용해 아이가 직접 움직이고 판단하며 즐겁게 참여합니다.",
           ["균형과 순발력을 쓰는 활동", "미션에 집중하고 반응하기", "다양한 신체 협응 연습", "생각과 움직임을 연결하는 도전"]),
          ("k_report", "그래프가 떠 있는 태블릿을 함께 보는 상담 장면", "GROWTH ASSESSMENT", "성장검사 프로그램", "정기적인 측정과 성장 관리", "측정과 분석으로 현재 상태와 변화 추이를 확인하고 관리 방향을 안내합니다.",
           ["체성분 · 체형 · 체력 등 측정", "데이터를 통한 변화 분석", "아이에게 맞는 성장 가이드"])]
    lis = "".join(f'<li><div class="x-pp">{img(n, a)}</div><div>{en(f"0{i + 1} · {e_}")}<h3>{b}</h3><strong>{s}</strong><p>{p}</p>{ticks(it)}</div></li>' for i, (n, a, e_, b, s, p, it) in enumerate(pg))
    jn = [("개인 특성 분석", "아이의 성향과 발달 상태를 파악합니다."), ("맞춤 프로그램 설계", "측정과 관찰을 바탕으로 활동을 구성합니다."), ("체계적인 수업 진행", "전문 강사와 함께 단계별로 도전합니다."),
          ("지속적인 성장 관리", "정기 측정과 피드백으로 조정합니다."), ("다음 성장을 준비", "신체 · 두뇌 · 사회성의 균형을 살핍니다.")]
    journey = ('<div class="x-jn rv"><h3>아이 한 명, 한 명의<br>성장 여정을 함께합니다.</h3><ol>' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in jn) + "</ol></div>")
    return sec(head("아이의 속도와 성향에 맞게.", "키즈스텝 <em>프로그램</em>", "<b>성장 단계에 맞춰 선택하는 네 가지 프로그램.</b> 움직이는 즐거움과 아이를 이해하는 데이터를 함께 담았습니다. 아이에게 필요한 성장 경험을 만나보세요.")
               + sw(f'<ul class="x-prog x-sc" tabindex="0">{lis}</ul>', "키즈스텝 프로그램 네 가지")
               + note("AR 스마트 운동에는 바닥에 나타나는 무늬를 보고 정해진 칸을 순서대로 밟는 ‘스퀘어 활동’ 등이 있습니다. 공간 인지와 민첩성, 하체 균형, 집중을 함께 쓰는 활동입니다.")
               + journey, soft=True, id="programs")


# ── 수업 안내(게시글 · 시간표에서 확인된 것)
def _class():
    why = rows([("형, 누나를 보며 눈으로 배웁니다", "동생들은 큰 아이들의 움직임을 직접 보며 따라 합니다. 조금 어려워 보이는 교구 앞에서도 두려움이 호기심으로 바뀝니다."),
                ("책임감과 리더십이 자라납니다", "큰 아이들은 그룹의 형님으로서 시범을 보이고 규칙을 설명해 주며, 배려하고 양보하는 마음을 연습합니다."),
                ("작은 사회를 경험합니다", "나이가 다른 친구들과 어울려 소통하고, 순서를 양보하고, 다 함께 규칙을 지키며 목표를 이루는 방법을 배웁니다.")])
    q = faq("5살 아이인데, 같은 5살 친구들끼리만 수업을 듣나요?",
            "<p>키즈스텝은 5세 반, 6세 반처럼 나이별로 나누지 않습니다. 유아부(4 ~ 7세)와 초등부(8 ~ 13세) 두 그룹으로 크게 나누고, 그룹 안에서는 다 함께 어울리는 통합 수업으로 진행합니다.</p>")
    days = ["월", "화", "수", "목", "금", "토"]
    tt = [("10:10", ["", "", "", "", "", "4 ~ 7"]), ("11:10", ["", "", "", "", "", "4 ~ 7"]), ("12:10", ["", "", "", "", "", "4 ~ 7"]), ("14:10", ["", "", "소그룹", "", "", "4 ~ 7"]),
          ("15:10", ["4 ~ 7", "3 ~ 4", "4 ~ 7", "3 ~ 4", "4 ~ 7", "4 ~ 7"]), ("16:10", ["4 ~ 5", "6 ~ 10", "5 ~ 7", "4 ~ 7", "5 ~ 7", ""]), ("17:10", ["5 ~ 7", "4 ~ 7", "7 ~ 10", "5 ~ 7", "5 ~ 7", ""]),
          ("18:10", ["3 ~ 4", "4 ~ 5", "초등", "4 ~ 7", "초등", ""]), ("19:10", ["4 ~ 7", "초등", "4 ~ 7", "초등", "4 ~ 7", ""])]
    def cell(c): return "<td></td>" if not c else (f'<td><b class="{"s" if c == "소그룹" else "e"}">{c}</b></td>' if c in ("초등", "소그룹") else f"<td>{c}</td>")
    table_ = ('<div class="tbl-w rv"><table class="tbl x-tt"><caption class="sr">키즈스텝 수업 시간표 — 요일과 시작 시각별 반(숫자는 한국 나이)</caption><thead><tr><th scope="col">시작</th>'
              + "".join(f'<th scope="col">{d}</th>' for d in days) + "</tr></thead><tbody>"
              + "".join(f'<tr><th scope="row">{t}</th>' + "".join(cell(c) for c in cs) + "</tr>" for t, cs in tt) + "</tbody></table></div>")
    time = ('<div class="x-time"><div class="x-time-h rv"><h3 class="h3">수업 시간표</h3><p>평일 15:10 ~ 19:10 · 토요일 10:10 ~ 15:10 · 수요일 14:10 소그룹</p></div>' + table_
            + f'<div class="x-time-n">{note("시간표의 숫자는 <b>한국 나이</b>입니다(‘초등’은 초등부). 2026년 8월에 안내된 시간표이며 사정에 따라 바뀔 수 있습니다. 보강이 필요하시면 시간표를 참고해 주세요. 일요일은 수업이 없습니다.")}'
            + dl([("지금 시간표 · 반 편성", f'전화로 안내해 드립니다. <a class="nb" href="tel:{T}">{TEL}</a>'), ("수업료 · 수업 길이 · 정원", "전화로 안내해 드립니다.")]) + "</div></div>")
    return sec(split(head("나이별로 나누지 않아요.", '<span class="nb">유아부 4 ~ 7세 ·</span> <span class="nb">초등부 8 ~ 13세,</span> <em>통합 수업</em>',
                          "두 그룹으로 크게 나누고, 그룹 안에서는 다 함께 어울려 수업합니다. 키즈스텝이 통합 수업을 고집하는 까닭은 세 가지입니다.", kind="stack"), why + f'<div class="x-faq rv">{q}</div>')
               + time, id="class")


# ── I. 성장 리포트 — 수치 · 그래프 · 도식은 모두 가상 예시(그 사이트가 밝힌 표시를 그대로)
def _report():
    def body(spine, head_, col):
        return (f'<svg viewBox="0 0 80 150" aria-hidden="true"><path d="M40 6v138" stroke="#9aa6b6" stroke-width="1.500" stroke-dasharray="4 4"/>'
                f'<circle cx="{head_}" cy="22" r="10" fill="none" stroke="{col}" stroke-width="4"/><path d="{spine}" fill="none" stroke="{col}" stroke-width="4.500" stroke-linecap="round"/>'
                f'<path d="M40 94v46M40 140h9" fill="none" stroke="{col}" stroke-width="4.500" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    d1 = ('<div class="x-ba" role="img" aria-label="이전 측정과 현재 측정의 옆모습 자세를 나란히 놓은 설명용 도식">'
          f'<div><b class="prev">BEFORE</b>{body("M46 33C34 46 28 66 40 94", 49, "#8d9bb0")}<span>앞으로 나온 머리 · 굽은 등</span><small>이전 측정 기록</small></div>'
          f'<div><b>AFTER</b>{body("M40 32C43 50 37 72 40 94", 40, "#1a7f79")}<span>머리 · 어깨 · 골반 정렬</span><small>현재 측정 기록</small></div></div>')
    d2 = ('<div class="x-radar" role="img" aria-label="체성분 · 체형 · 체력 · 균형 · 발 아치 · 성장 추이 여섯 영역을 이전과 현재로 겹쳐 보는 육각 그래프 예시">'
          '<svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#d3dae3" stroke-width="1.500">'
          '<path d="M100 20l69.300 40v80L100 180l-69.300-40V60z"/><path d="M100 46.700l46.200 26.600v53.400L100 153.300l-46.200-26.600V73.300z"/><path d="M100 73.300l23.100 13.400v26.600L100 126.700l-23.100-13.400V86.700z"/>'
          '<path d="M100 20v160M30.700 60l138.600 80M169.300 60L30.700 140"/></g>'
          '<path d="M100 62l31 21-2 36-29 23-33-23 3-38z" fill="rgba(16,29,51,.1)" stroke="#101d33" stroke-width="2" stroke-linejoin="round"/>'
          '<path d="M100 36l54 33-4 60-50 34-53-32 2-61z" fill="rgba(26,127,121,.2)" stroke="#1a7f79" stroke-width="3" stroke-linejoin="round"/></svg>'
          '<span class="a1">체성분</span><span class="a2">체형</span><span class="a3">체력</span><span class="a4">균형</span><span class="a5">발 아치</span><span class="a6">성장 추이</span></div>'
          '<ul class="x-legend" aria-hidden="true"><li class="prev">이전</li><li>현재</li></ul>')
    d3 = ('<table class="x-ct"><thead><tr><th scope="col">측정 항목</th><th scope="col">이전</th><th scope="col">현재</th></tr></thead><tbody>'
          '<tr><th scope="row">체중 (kg)</th><td>28.4</td><td>30.1</td></tr><tr><th scope="row">골격근량 (kg)</th><td>12.1</td><td>14.3</td></tr><tr><th scope="row">체지방률 (%)</th><td>22.3</td><td>16.8</td></tr></tbody></table>')
    bars = [("순발력", 60, 80), ("근력", 55, 78), ("지구력", 58, 82), ("민첩성", 60, 85), ("유연성", 60, 80), ("평형성", 55, 78)]
    d4 = ('<ul class="x-bars" aria-label="체력 영역별 이전 · 현재 예시 값">' + "".join(f'<li><b>{n}</b><div><i class="prev" style="--v:{a}">{a}</i><i style="--v:{b}">{b}</i></div></li>' for n, a, b in bars)
          + '</ul><ul class="x-legend sq" aria-hidden="true"><li class="prev">이전</li><li>현재</li></ul>')
    d5 = ('<div class="x-bn"><div><small>정적 균형 · 예시</small><p><span>50</span><i aria-hidden="true"></i><b>82</b></p></div><div><small>동적 균형 · 예시</small><p><span>53</span><i aria-hidden="true"></i><b>85</b></p></div></div>')
    foot = "M30 8c10 0 16 9 16 22 0 9-4 15-5 24-1 10 3 16 3 26 0 12-6 20-14 20s-13-8-13-19c0-9 4-15 4-25 0-9-5-16-5-27C16 17 21 8 30 8z"
    def ft(flip): return (f'<svg viewBox="0 0 60 110" aria-hidden="true"{" style=\"transform:scaleX(-1)\"" if flip else ""}><path d="{foot}" fill="rgba(26,127,121,.1)" stroke="#1a7f79" stroke-width="2.500"/>'
                          '<ellipse cx="31" cy="29" rx="9" ry="11" fill="#1a7f79" opacity=".8"/><ellipse cx="30" cy="87" rx="8" ry="9" fill="#101d33" opacity=".78"/><ellipse cx="40" cy="56" rx="3" ry="9" fill="#1a7f79" opacity=".35"/></svg>')
    d6 = f'<div class="x-feet" role="img" aria-label="두 발바닥의 모양과 압력 자리를 나타낸 설명용 도식">{ft(False)}{ft(True)}</div>'
    pn = [("이전과 현재 비교", "같은 조건에서 기록한 측정 결과를 나란히 살펴봅니다.", d1, "실선은 척추 곡선, 점선은 수직 기준선입니다. 자세 차이를 강조한 설명용 도식이며 실제 교정 결과를 뜻하지 않습니다."),
          ("종합 성장 분석", "여섯 영역의 기록을 모아 전체적인 변화의 흐름을 확인합니다.", d2, ""),
          ("체성분 변화", "체중, 골격근량, 체지방률을 함께 살펴봅니다.", d3, "수치의 높고 낮음만으로 판단하지 않고, 아이의 연령과 발달 상태를 함께 살핍니다."),
          ("체력 영역별 비교", "각 체력 요소의 기록을 비교하며 다음 활동의 방향을 정합니다.", d4, ""),
          ("균형과 자세", "정적 · 동적 균형과 체형 기록을 함께 확인합니다.", d5, "체형 정렬과 움직임을 함께 관찰하고, 균형을 사용하는 활동에 반영합니다."),
          ("발 아치와 체중 분포", "발의 형태와 압력 분포를 기록하고 비교합니다.", d6, "발 모양은 설명용 도식입니다. 실제 리포트에서는 측정 이미지와 해석을 함께 확인합니다.")]
    pns = "".join(f'<section class="x-pn"><h3><i>0{i + 1}</i>{t}{EX}</h3><p>{p}</p><div class="x-pn-d">{d}</div>{f"<p class=\"x-pn-n\">{n}</p>" if n else ""}</section>' for i, (t, p, d, n) in enumerate(pn))
    sheet = ('<div class="x-sheet"><div class="x-sheet-h"><b>KIDSTEP GROWTH REPORT</b><span>리포트 구성 예시 · 가상 수치</span></div>' + f'<div class="x-pns x-sc" tabindex="0">{pns}</div></div>')
    four = [("데이터 기반 분석", "측정 항목을 모아 아이의 현재 상태를 이해합니다."), ("정기 측정과 비교", "누적된 기록으로 변화의 흐름을 살펴봅니다."),
            ("맞춤 성장 가이드", "아이에게 필요한 활동과 다음 목표를 정합니다."), ("부모와 함께 공유", "리포트를 함께 보며 성장 과정을 이야기합니다.")]
    close = '<div class="x-jn rv"><h3>리포트는 성장의 방향을 찾는 기준입니다.</h3><ol class="c4">' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in four) + "</ol></div>"
    return sec(head("기록으로 보는 우리 아이의 변화.", "성장 <em>리포트</em>",
                    "<b>아이의 현재를 알고, 다음 성장의 방향을 찾습니다.</b> 체성분 · 체형 · 체력 · 균형 · 발 아치 · 성장 추이까지. 측정 기록과 변화의 흐름을 한눈에 확인하세요.")
               + sw(sheet, "성장 리포트 구성 예시 여섯 가지") + close
               + f'<div class="x-gap">{note("모든 수치 · 그래프 · 도식은 구성 이해를 위한 <b>가상 예시</b>이며 실제 고객의 결과가 아닙니다. 실제 리포트의 <span class=\"nb\">항목 · 양식</span>과 개인의 변화는 다를 수 있습니다.")}</div>',
               soft=True, id="report")


# ── J. 센터 소개 — 사람 · 안전 · 파트너
def _center_band():
    return ('<section class="band has-tx" id="center"><div class="band-i">' + img("k_space", "매트와 평균대, 사다리 교구가 놓인 넓은 운동 공간") + '</div>'
            '<div class="wrap band-tx rv"><span class="eb">아이의 성장을 함께하는 사람과 공간.</span><h2>키즈스텝<br>스마트성장센터 소개</h2>'
            '<p><b>전문 인력과 체계적인 관리가 함께합니다.</b> 아이를 이해하는 전문성과 안심할 수 있는 환경으로 한 걸음씩 성장의 과정을 함께합니다.</p></div></section>\n')

def _people():
    def who(pic, alt, role, name, line, certs, cls=""):
        return (f'<article class="x-who{" " + cls if cls else ""} rv"><div class="x-who-p">{img(pic, alt)}</div><div class="x-who-h"><small>{role}</small><h3>{name}</h3><strong>{line}</strong></div>'
                '<ul>' + "".join(f"<li>{c}</li>" for c in certs) + "</ul></article>")
    boss = who("director", "이유진 대표", "대표", "이유진", "아이의 성장을 위한 전문성과 진심으로 함께합니다.",
               ["루터대학교 재활복지대학원 졸업 · 전 학기 수석 (언어치료학 석사)", "아동발달과 교육을 위한 음악치료교육 이수", "한국언어재활사협회 정회원", "뉴로피드백(Neuro-Feedback Therapy) 치료사",
                "감각운동통합 훈련(Interactive Metronome Therapy) 치료사", "연세대학교 미래교육원 응용행동분석 전문과정(ABA) 수료", "1급 언어재활사 · 인지학습치료사 2급 · 스피치 지도사 3급"], "boss")
    seon = who("ks/staff-seon.webp", "선호세 센터장", "센터장", "선호세", "다양한 신체활동으로 아이의 도전과 성장을 함께합니다.",
               ["유아체육 지도자 · 유소년 스포츠 지도자", "유소년 농구 · 축구 지도자", "태권도 4단 · 합기도 5단", "태권도 · 합기도 심판 자격증", "음악줄넘기 지도자 1급 · 유소년 인라인 지도자", "대한 밸런스 의학회 수료증"])
    lee = who("ks/staff-lee.webp", "이동건 실장", "실장", "이동건", "아이의 움직임과 발달 단계에 맞춘 활동을 지도합니다.",
              ["유아체육 지도자 · 유소년 스포츠 지도자", "생활체육 지도자 3급", "농구 심판 자격증", "스포츠 마사지 · 카이로프랙틱", "캉구점프 지도자", "대한 밸런스 의학회 수료증"])
    safe = rows([("안전한 시설", "충격 흡수 바닥재와 안전 설비, 정기적인 점검으로 활동 환경을 관리합니다."), ("공기와 위생 관리", "공기청정 시스템과 주기적인 소독으로 쾌적한 환경을 유지합니다."),
                 ("CCTV · 출입 관리", "CCTV 모니터링과 출입 관리 시스템으로 아이의 활동 공간을 살핍니다."), ("응급 대응 체계", "응급처치 교육과 비상 연락 체계를 바탕으로 신속하게 대응합니다.")], cols=2)
    tr = [("전문 자격", "체육 · 언어 · 발달 분야의 전문성을 바탕으로 아이를 지도합니다."), ("지속적인 교육", "내부 교육과 전문 연수로 지도 역량을 쌓습니다."),
          ("근거와 데이터", "측정 기록과 관련 근거를 참고해 프로그램을 구성합니다."), ("협력을 통한 발전", "대학 · 연구기관 · 전문단체와의 협력으로 프로그램을 발전시킵니다.")]
    trust = ('<div class="x-trust rv"><h3>신뢰할 수 있는<br><em>전문 성장 파트너.</em></h3><ul>' + "".join(f"<li><b>{b}</b><span>{s}</span></li>" for b, s in tr) + "</ul></div>")
    return sec(boss + f'<div class="x-who2">{seon}{lee}</div>'
               + f'<div class="x-gap">{note("위 목록은 각 지도자가 보유한 <span class=\"nb\">자격 · 수료</span> 내역입니다. 키즈스텝의 수업은 운동과 성장 관리 프로그램으로 진행합니다.")}</div>'
               + sub("안전과 위생도, 세심하게.", "아이들이 안심하고 활동할 수 있도록 시설과 운영 환경을 함께 관리합니다.") + safe + trust
               + '<div class="center x-q">' + quote("아이의 오늘을 이해하고,<br>더 큰 내일을 함께 준비합니다.") + "</div>", id="people")


# ── K. 아이와 부모가 함께 성장하는 공간 — 부모 케어 · 협력사 · 상담 안내
def _family():
    care = rows([("부모 교육 세미나", "성장, 자세, 사회성 발달을 이해하는 교육을 제공합니다."), ("부모 상담과 코칭", "아이의 단계에 맞는 상담과 양육 방향을 함께 이야기합니다."),
                 ("가정 연계 가이드", "집에서도 이어갈 수 있는 운동과 생활 습관을 안내합니다."), ("부모 커뮤니티", "정보를 나누고 소통하는 온 · 오프라인 교류를 지원합니다.")])
    pt = [("logo-mark.webp", "킨더윌", "사회성 프로그램 협력"), ("ks/logo-didim.webp", "디딤", "신체 · 뇌 훈련 프로그램 협력"), ("ks/logo-exbody.webp", "엑스바디", "체형 측정 시스템"), ("ks/logo-inbody.webp", "InBody", "체성분 측정 · 분석")]
    logos_ = '<ul class="x-logos rv">' + "".join(f'<li><i>{img(f, n + " 로고")}</i><b>{n}</b><span>{s}</span></li>' for f, n, s in pt) + "</ul>"
    call = ('<div class="x-call rv"><h3>우리 아이의 성장을<br><em>지금 함께 시작해요.</em></h3><div class="x-call-g">'
            '<div><b>1:1 상담 신청</b><p>아이에게 맞는 프로그램을 상담해 보세요. 아래 전화로 문의하실 수 있습니다.</p></div>'
            '<div><b>센터 방문 예약</b><p>수업과 공간을 직접 살펴보세요. 전화로 방문 일정을 안내해 드립니다.</p></div>'
            f'<a class="x-tel" href="tel:{T}"><small>전화로 상담 · 예약하기{ic("ext")}</small><b>{TEL}</b><span>궁금한 점을 편하게 문의해 주세요.</span></a></div>'
            f'<p class="x-call-b">{btn("상담 문의 남기기", href("contact"), "btn-lime")}<a class="btn x-btn-o" href="{TALK}" target="_blank" rel="noopener">네이버 톡톡 문의{ic("ext")}</a></p></div>')
    return sec(head("아이의 변화가 가족의 일상으로.", "아이와 부모가 <em>함께 성장하는 공간</em>", "아이의 성장을 넘어, 가족의 건강한 변화를 함께합니다.")
               + f'<div class="two wide-r top">{figure("k_parent", "부모 교육 세미나", alt="화면을 보며 설명을 듣는 보호자들의 뒷모습", cls="arch dot")}'
               + f'<div>{sub("부모와 함께하는 성장", "부모의 이해와 참여가 아이의 성장 경험을 일상으로 이어줍니다.", eb="PARENT CARE")}{care}</div></div>'
               + f'<div class="x-part">{sub("전문성과 기술의 연결", "전문 프로그램과 측정 시스템을 연결해 아이를 더 깊이 이해합니다.", eb="PROFESSIONAL PARTNERS")}{logos_}'
               + '<p class="x-part-n rv">다양한 분야의 전문성과 데이터를 바탕으로 성장 관리의 방향을 함께 설계합니다.</p></div>' + call, soft=True, id="consult")


# ── 오시는 길
def _visit():
    b = BR["ks"]
    info = dl([("센터 주소", f'{b["addr"]} (상계동) <span class="nb">대명빌딩 401호(4층)</span><br>킨더윌 3센터와 같은 건물입니다.'),
               ("방문 전 전화 문의", f'<a class="nb" href="tel:{T}">{TEL}</a> · <a class="nb" href="tel:01029703421">010-2970-3421</a>'),
               ("수업 대상", "유아부 4 ~ 7세 · 초등부 8 ~ 13세"), ("운영 시간 · 수업료 · 주차", "전화로 안내해 드립니다."),
               ("온라인", f'<a href="{KIDSTEP_URL}" target="_blank" rel="noopener">kidstep.co.kr</a> · <a href="{TALK}" target="_blank" rel="noopener">네이버 톡톡</a> · '
                          f'<a href="{KBLOG}" target="_blank" rel="noopener">블로그</a> · <a href="{KINSTA}" target="_blank" rel="noopener">인스타그램</a> <span class="nb">(새 창)</span>')])
    act = (f'<div class="cen-act rv"><a class="btn btn-ink" href="tel:{T}">{ic("tel")}{TEL}</a>{btn("상담 문의하기", href("contact"))}'
           f'<a class="btn btn-line" href="{KIDSTEP_URL}" target="_blank" rel="noopener">키즈스텝 홈페이지{ic("ext")}</a></div>')
    mp = f'<div class="cen-map rv"><iframe data-map data-addr="{b["addr"]}" data-name="{b["name"]}" title="키즈스텝 위치 지도" loading="lazy"></iframe></div>'
    return sec(head("아이의 새로운 성장이 시작되는 곳.", "찾아오시는 <em>길</em>", "수업과 공간을 직접 살펴보실 수 있습니다. 방문 전에 전화로 문의해 주시면 일정을 안내해 드립니다.")
               + f'<div class="two top x-loc">{mp}<div class="stack">{info}{act}</div></div>', id="visit")


# ── 성장스토리 — 그 사이트 게시판으로 보내는 바깥 링크(글 제목만)
def _story():
    posts = [("2026.10.02", "달라진 육아 환경! 요즘 아이들 체력이 약하고 발달이 늦어지는 진짜 이유", 174939710),
             ("2026.10.01", "나이별로 나누지 않아요! 4 ~ 7세 / 8 ~ 13세 통합 수업을 고집하는 특별한 이유", 174921656),
             ("2026.09.30", "손과 발이 척척! 우리 아이 두뇌와 운동신경을 깨우는 ‘협응력’의 비밀", 174904356),
             ("2026.08.18", "발 밑을 주목해! 공간 감각과 민첩성을 키우는 ‘스퀘어 활동’", 173189879),
             ("2026.08.13", "감으로 키우는 운동은 그만! 과학적 측정으로 보는 우리 아이 진짜 운동 능력", 173070945),
             ("2026.08.12", "우리 아이, 운동만 시키면 될까요? 신체 · 사회성 · 두뇌 발달을 한 번에 잡아야 하는 이유", 173045815)]
    lst = ('<ol class="rows plain x-posts rv">' + "".join(f'<li><a href="{BOARD}/?bmode=view&amp;idx={i}&amp;t=board" target="_blank" rel="noopener"><b>{t}</b><span>{d} · 키즈스텝 성장스토리 (새 창)</span>{ic("ext")}</a></li>' for d, t, i in posts) + "</ol>")
    act = (f'<p class="x-story-b rv"><a class="btn btn-ink" href="{BOARD}" target="_blank" rel="noopener">성장스토리 더 보기{ic("ext")}</a>'
           f'<a class="btn btn-line" href="{KBLOG}" target="_blank" rel="noopener">키즈스텝 블로그{ic("ext")}</a><a class="btn btn-line" href="{KINSTA}" target="_blank" rel="noopener">인스타그램{ic("ext")}</a></p>')
    return sec(split(head("성장의 순간을 나눕니다.", "키즈스텝 <em>성장스토리</em>", "아이의 건강한 성장을 위한 소식과 정보를 전합니다. 키즈스텝 블로그 · 소식에서 더 보실 수 있습니다.", kind="stack") + act, lst), soft=True, id="story")


def pages():
    inner = (_intro() + _why() + _data() + _train() + _steps() + _scene() + _six() + _seven() + _program() + _class() + _report()
             + _center_band() + _people() + _family() + _visit() + _story())
    return [("kidstep", subpage("kidstep", "키즈스텝<wbr>스마트<wbr>성장센터", "아이의 오늘을 과학적으로 설계하고, 더 큰 미래로 성장시킵니다.", inner,
                                bg="k_main", bg_pos="62% 50%", body_cls="ks-page", ph_cls="ks-ph", title="키즈스텝스마트성장센터",
                                say="아이의 성장은 운동이 아니라 ‘관리’입니다.",
                                desc="키즈스텝 스마트성장센터 — 아이의 성장을 측정하고, 분석하고, 관리합니다. 여섯 영역 측정에서 분석 · 맞춤 프로그램 · 성장 관리 · 성장 리포트까지. 서울 노원구 상계로27길 32 대명빌딩 401호, 02-936-3421."))]
