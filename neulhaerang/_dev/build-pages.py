"""늘해랑 하위 페이지 만들기 — 머리 · 꼬리는 index.html 것을 그대로 가져와 본문만 끼운다.
   실행: python neulhaerang/_dev/build-pages.py   (index.html 의 머리 · 꼬리를 고친 뒤에는 다시 실행)
   내용 출처: 센터 네이버 플레이스 소개 · 블로그 · 받은 프로필 그림(_pc/neulhaerang) — 지어내지 않는다."""
import re
from pathlib import Path
R = Path(__file__).resolve().parents[1]
idx = (R / 'index.html').read_text(encoding='utf-8')
HEAD = idx[:idx.index('<main id="main">')]
FOOT = idx[idx.index('<footer class="ft">'):]
HEAD = re.sub(r'<link rel="preload" as="image"[^>]*>\n', '', HEAD).replace('<body class="home">', '<body class="sub">')
NAVER = 'https://booking.naver.com/booking/6/bizes/1576513'
GO = '<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

def head(title, desc):
    h = HEAD.replace('<title>늘해랑심리상담센터</title>', f'<title>{title} | 늘해랑심리상담센터</title>')
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', h)
    h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{title} | 늘해랑심리상담센터">', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{desc}">', h)
    return h

def banner(img, hand, title, lede, pos=''):
    return f'''
  <section class="pg-hero{pos}" aria-label="{title}">
    <img src="images/{img}" alt="" width="1672" height="941" fetchpriority="high">
    <div class="wrap">
      <p class="pg-hand">{hand}</p>
      <h1>{title}</h1>
      <p class="pg-lede">{lede}</p>
    </div>
  </section>'''

ABOUT_TABS = [('about.html', '인사말'), ('team.html', '담당 선생님'), ('location.html', '오시는 길')]
def tabs(cur):
    a = ''.join(f'<a href="{h}"{" class=\"on\" aria-current=\"page\"" if h == cur else ""}>{t}</a>' for h, t in ABOUT_TABS)
    return f'\n  <nav class="pg-tabs" aria-label="센터소개 메뉴"><div class="tabs" data-tabs>{a}</div></nav>'

def cta(text='상담이 필요한 순간, 늘해랑이 함께합니다.'):
    return f'''
  <section class="outro" aria-label="예약 안내">
    <div class="wrap" data-reveal>
      <img src="images/logo-mark.webp" width="677" height="605" loading="lazy" alt="">
      <p>“{text}”</p>
      <div class="btns"><a class="btn btn-main" href="{NAVER}" target="_blank" rel="noopener">네이버로 예약하기{GO}</a><a class="btn btn-line" href="sms:01067934899">문자로 문의하기</a></div>
    </div>
  </section>'''

def page(name, title, desc, body):
    html = head(title, desc) + '<main id="main">' + body + '\n\n</main>\n\n' + FOOT
    (R / name).write_text(html, encoding='utf-8', newline='\n')
    print(name, len(html))

# ───────────────────────── 센터소개 › 인사말
page('about.html', '인사말', '늘해랑심리상담센터 센터장 문은정의 인사말과 상담 철학. 늘 해와 같이 살아가는 밝고 강한 사람, 늘해랑.',
banner('hero.webp', '센터소개', '인사말', '늘 해와 같이 살아가는 밝고 강한 사람, 늘해랑') + tabs('about.html') + f'''

  <section class="sec">
    <div class="wrap letter">
      <div class="letter-ph" data-reveal>
        <img src="images/director.webp" width="560" height="560" loading="lazy" alt="문은정 센터장">
        <p class="dir-sign"><b>문은정</b><span>늘해랑심리상담센터 센터장</span></p>
      </div>
      <div class="letter-tx" data-reveal>
        <span class="eyebrow">안녕하세요, 늘해랑입니다</span>
        <h2>이미 가지고 있는 힘을<br><em>다시 발견하실 수 있도록</em></h2>
        <p>늘해랑심리상담센터는 마음의 어려움 속에서도 자기 삶을 다시 살아갈 힘을 회복해 가는 과정을 함께하고자 만든 공간입니다.</p>
        <p><b>‘늘해랑’은 “늘 해와 같이 살아가는 밝고 강한 사람”이라는 뜻의 순우리말</b>입니다. 이 이름에는 상담을 통해 누군가를 바꾸거나 고치기보다, 이미 가지고 있는 힘을 다시 발견하고 자기 삶을 살아갈 수 있도록 곁에서 함께하겠다는 마음을 담았습니다.</p>
        <p>늘해랑에서의 상담은 빠른 해결이나 정답을 제시하는 과정이 아닙니다. 지금의 마음 상태를 차분히 이해하고, 각자의 속도로 회복해 갈 수 있도록 안전한 관계 안에서 함께 머무는 시간을 중요하게 생각합니다.</p>
        <p>저는 아동과 청소년의 정서적 회복과 건강한 성장, 그리고 가족의 관계 회복을 돕는 상담을 해 왔습니다. 한 사람, 한 사람의 마음에 온전히 집중하며 자신의 감정을 이해하고 건강한 변화를 만들어 가실 수 있도록 함께하겠습니다.</p>
        <p class="letter-end hand">마음이 편안해지는 상담, 늘해랑에서 시작하세요.</p>
      </div>
    </div>
  </section>

  <section class="sec sec-warm">
    <div class="wrap">
      <div class="sec-head center" data-reveal>
        <span class="eyebrow">상담에서 중요하게 여기는 것</span>
        <h2>늘해랑의 <em>상담 철학</em></h2>
      </div>
      <div class="cards3">
        <div class="card" data-reveal><i class="num hand">하나</i><h3>있는 그대로 존중합니다</h3><p>인간중심 상담의 철학을 바탕으로, 내담자 한 분 한 분의 고유한 경험과 정서의 세계를 존중합니다.</p></div>
        <div class="card" data-reveal><i class="num hand">둘</i><h3>안전한 관계가 먼저입니다</h3><p>상담에서 가장 중요한 것은 신뢰할 수 있고 안전한 관계입니다. 그 위에서 스스로 변화와 회복의 가능성을 발견하도록 돕습니다.</p></div>
        <div class="card" data-reveal><i class="num hand">셋</i><h3>말이 어려우면 다른 길로</h3><p>모래놀이치료 · 미술치료 같은 표현 매체를 함께 써서, 언어로 표현하기 어려운 감정과 갈등을 상징과 이미지로 탐색합니다.</p></div>
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="wrap">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">센터장 문은정</span>
        <h2>걸어온 길</h2>
      </div>
      <div class="cv" data-reveal>
        <div>
          <h3>학력</h3>
          <ul class="dots"><li>명지대학교 일반대학원 아동학과 아동가족심리치료 전공 박사수료</li><li>명지대학교 사회교육대학원 예술심리치료학과 표현예술심리치료 전공 석사 졸업</li></ul>
          <h3>자격 · 학회</h3>
          <ul class="dots"><li>한국상담심리학회 정회원</li><li>한국표현예술심리상담학회 정회원</li><li>한국모래놀이치료학회 정회원</li><li>놀이심리상담사 · 미술심리상담사 · 모래놀이치료사</li><li>부모교육지도사</li></ul>
        </div>
        <div>
          <h3>경력</h3>
          <ul class="dots"><li>현) 늘해랑심리상담센터 센터장</li><li>전) 온정심리상담소 소장</li><li>전) 세화정신의학원 낮병동 미술치료</li><li>전) 원자력병원 어린이병원학교 암병동 미술치료</li><li>전) 비커밍미술치료연구소 미술치료</li><li>전) 하계사회복지관 미술치료</li><li>전) 종로구다문화가족지원센터 집단미술치료</li><li>전) 월곡청소년센터 미술치료 및 모래놀이치료</li><li>전) 중랑초등학교 · 중목초등학교 · 중화초등학교 모래놀이치료</li></ul>
        </div>
      </div>
      <p class="more-row" data-reveal><a class="btn btn-line" href="team.html">담당 선생님 모두 보기{GO}</a></p>
    </div>
  </section>''' + cta())

# ───────────────────────── 센터소개 › 담당 선생님
def prof(img, role, name, quote, cols):
    c = ''.join(f'<div><h4>{h}</h4><ul class="dots">{"".join(f"<li>{x}</li>" for x in items)}</ul></div>' for h, items in cols)
    q = f'<p class="prof-q hand">“{quote}”</p>' if quote else ''
    return f'''
        <article class="prof" data-reveal>
          <div class="prof-ph"><img src="images/{img}" width="560" height="560" loading="lazy" alt="{name} {role}"></div>
          <div class="prof-tx">
            <p class="prof-role">{role}</p>
            <h3>{name}</h3>{q}
            <div class="prof-cols">{c}</div>
          </div>
        </article>'''
page('team.html', '담당 선생님', '늘해랑심리상담센터의 담당 선생님 — 센터장 문은정, 수석상담사 정연옥, 손옥희 선생님, 자문위원 이선욱.',
banner('detail.webp', '센터소개', '담당 선생님', '마음을 함께 돌보는 늘해랑의 선생님들을 소개합니다') + tabs('team.html') + '''

  <section class="sec">
    <div class="wrap">
      <div class="profs">''' +
prof('director.webp', '센터장', '문은정', '이미 가지고 있는 힘을 다시 발견하실 수 있도록 곁에서 함께하겠습니다.', [
    ('학력 · 현직', ['현) 늘해랑심리상담센터 센터장', '전) 온정심리상담소 소장', '명지대 일반대학원 아동가족심리치료 박사수료', '명지대 사회교육대학원 예술심리치료학과 표현예술심리치료 전공 석사 졸업']),
    ('경력', ['세화정신의학원 낮병동 미술치료', '원자력병원 어린이병원학교 암병동 미술치료', '비커밍미술치료연구소 미술치료', '하계사회복지관 미술치료', '종로구다문화가족지원센터 집단미술치료', '월곡청소년센터 미술치료 및 모래놀이치료', '중랑 · 중목 · 중화초등학교 모래놀이치료']),
    ('자격 · 학회', ['한국상담심리학회 정회원', '한국표현예술심리상담학회 정회원', '한국모래놀이치료학회 정회원', '놀이심리상담사 · 미술심리상담사', '모래놀이치료사 · 부모교육지도사'])]) +
prof('mate-jung.webp', '수석상담사', '정연옥', '', [
    ('학력 · 현직', ['현) 늘해랑심리상담센터 수석상담사', '현) 봄아동 청소년 발달심리센터 부소장', '명지대 일반대학원 아동가족심리치료 박사수료', '서울상담심리대학원 긍정심리학 석사']),
    ('경력', ['서울시 교육청 학습상담사(초 · 중 · 고)', '서울시 유아교육진흥원, 유보통합 전문상담', '근로복지공단 산재 상담사', '창천초등학교 상담사', '인싸이트 심리검사해석 강사', '한국상담학회 · 전생애놀이치료학회 정회원']),
    ('자격', ['보건복지부 임상심리사', '여성가족부 청소년상담사', '놀이심리상담사 1급', '부모교육지도사 1급', '미술심리상담사 1급'])]) +
prof('mate-son.webp', '인지행동놀이 · 학습치료 담당', '손옥희', '아이의 생각과 행동을 이해하고, 스스로 성장하는 힘을 함께 키워갑니다.', [
    ('학력', ['명지대학교 일반대학원 아동가족심리치료 박사수료', '서울상담심리대학원 긍정심리학 석사']),
    ('경력', ['현) 서울시 서부교육지원청 학습상담사', '전) 서울시 성동광진교육지원청 학습상담사', '전) 종로, 성북가족센터 상담원', '전) 서울시 재난심리회복센터 상담활동가']),
    ('자격 · 학회', ['보건복지부 임상심리사 1급', '한국인지행동치료학회 정회원'])]) +
prof('mate-lee.webp', '자문위원', '이선욱', '', [
    ('전문 분야', ['표현예술심리치료 전문가', '정신분석전문가']),
    ('현직 · 경력', ['심리상담센터 이김 센터장', '명지대학교 대학원 예술심리치료학과 겸임교수']),
    ('늘해랑에서', ['정기 자문 및 사례 슈퍼비전 진행'])]) + '''
      </div>
    </div>
  </section>''' + cta('한 사람, 한 사람의 마음에 온전히 집중합니다.'))

# ───────────────────────── 센터소개 › 오시는 길
MAP = 'https://xim.plators.com/map?addr=%EC%84%9C%EC%9A%B8%20%EB%85%B8%EC%9B%90%EA%B5%AC%20%ED%95%9C%EA%B8%80%EB%B9%84%EC%84%9D%EB%A1%9C%20396&amp;name=%EB%8A%98%ED%95%B4%EB%9E%91%EC%8B%AC%EB%A6%AC%EC%83%81%EB%8B%B4%EC%84%BC%ED%84%B0&amp;c=4e6b4c'
page('location.html', '오시는 길', '늘해랑심리상담센터 오시는 길 — 서울 노원구 한글비석로 396 벽산종합상가 108동 2층 7호, 4호선 상계역 5번 출구 도보 3분, 지하 주차장 무료.',
banner('hall.webp', '센터소개', '오시는 길', '상계역 5번 출구에서 횡단보도만 건너면 됩니다', ' up') + tabs('location.html') + f'''

  <section class="sec">
    <div class="wrap">
      <div class="map map-big" data-reveal><iframe src="{MAP}" loading="lazy" title="늘해랑심리상담센터 지도"></iframe></div>
      <div class="loc" data-reveal>
        <div class="loc-box">
          <h2>서울 노원구 한글비석로 396</h2>
          <p>벽산종합상가 108동 2층 7호</p>
          <div class="btns"><a class="btn btn-main" href="https://map.naver.com/p/entry/place/2045904042" target="_blank" rel="noopener">네이버 지도에서 길찾기{GO}</a><a class="btn btn-line" href="tel:01067934899">010-6793-4899</a></div>
        </div>
        <dl class="loc-list">
          <div><dt>지하철</dt><dd><b>4호선 상계역 5번 출구 도보 3분</b>5번 출구로 나와 횡단보도를 건너면 벽산종합상가가 있습니다. 108동 2층 7호로 올라오세요.</dd></div>
          <div><dt>주차</dt><dd><b>벽산종합상가 지하 주차장 무료</b>벽산아파트 정문으로 들어와 108동 쪽으로 직진한 뒤, 왼쪽 지하 주차장으로 내려가시면 됩니다.</dd></div>
          <div><dt>상담 시간</dt><dd><b>월 – 금 10:00 – 22:00 · 토요일 10:00 – 19:00</b>일요일은 둘째 · 넷째 주에 상담합니다. 모든 상담은 사전 예약으로만 진행합니다.</dd></div>
          <div><dt>문의</dt><dd><b>010-6793-4899</b>상담 중에는 통화가 어렵습니다. 문자를 남겨 주시면 확인하는 대로 연락드립니다.</dd></div>
        </dl>
      </div>
      <div class="loc-ph" data-reveal>
        <figure><img src="images/door.webp" width="1086" height="1448" loading="lazy" alt="늘해랑심리상담센터 출입문과 간판"><figcaption>2층 7호, 둥근 간판이 걸린 초록 문을 찾아 주세요</figcaption></figure>
        <figure><img src="images/hall.webp" width="1086" height="1448" loading="lazy" alt="대기 공간"><figcaption>문을 열면 보이는 대기 공간</figcaption></figure>
      </div>
    </div>
  </section>''' + cta('천천히, 편안한 마음으로 오세요.'))

# ───────────────────────── 상담프로그램
def prog(pid, img, w, h, hand, title, lead, who, how, flip=False):
    return f'''
      <article class="prog{" flip" if flip else ""}" id="{pid}" data-reveal>
        <div class="prog-ph"><img src="images/{img}" width="{w}" height="{h}" loading="lazy" alt="{title}"></div>
        <div class="prog-tx">
          <span class="eyebrow">{hand}</span>
          <h2>{title}</h2>
          <p class="prog-lead">{lead}</p>
          <h3>이런 분께 도움이 됩니다</h3>
          <ul class="dots">{"".join(f"<li>{x}</li>" for x in who)}</ul>
          <h3>이렇게 진행합니다</h3>
          <p>{how}</p>
        </div>
      </article>'''
KIND_NAV = idx[idx.index('<div class="kinds">'):idx.index('<ul class="trust">')]
KIND_NAV = KIND_NAV.replace('href="child.html"', 'href="#x"').replace('href="adult.html"', 'href="#x"')
TRUST = idx[idx.index('<ul class="trust">'):idx.index('</ul>', idx.index('<ul class="trust">')) + 5]
page('program.html', '상담프로그램', '늘해랑심리상담센터 상담프로그램 — 놀이치료 · 미술치료 · 모래놀이치료 · 부부/성인 상담 · TCI 기질성격검사 · 비대면 상담 · 아동 소그룹 프로그램.',
banner('play.webp', '아동 · 청소년 · 성인 · 부부 상담', '상담프로그램', '연령과 마음의 상태, 상담 목표에 따라 알맞은 방법을 골라 함께 씁니다') + f'''

  <section class="kinds-sec kinds-sub" aria-label="상담 종류">
    <div class="wrap">
      {KIND_NAV}
      {TRUST}
    </div>
  </section>

  <section class="sec">
    <div class="wrap progs">''' +
prog('play', 'play.webp', 1536, 1024, '아이의 마음을 놀이로', '놀이치료', '아이는 말보다 행동과 놀이로 마음을 표현합니다. 아이가 이끄는 놀이 안에서 마음 상태를 안전하게 이해하고, 정서 조절과 관계 경험을 돕습니다.',
     ['감정 조절이 어렵고 짜증이나 분노 표현이 잦은 아이', '불안이 높고 걱정이 많은 상태가 계속되는 아이', '또래 관계에서 위축되거나 친구 사귀기가 어려운 아이', '분리불안, 등원 · 등교 거부가 반복되는 아이', '주의가 쉽게 흩어지고 집중이 어려운 아이'],
     '충분한 초기 면접으로 아이와 가정을 이해한 뒤 상담 목표를 정합니다. 아이의 발달 수준과 정서적 욕구에 맞춰 진행하며, 정기적인 부모 상담으로 가정에서의 변화도 함께 살핍니다.') +
prog('art', 'desk.webp', 1086, 1448, '그림과 색으로 마음을', '미술치료', '말로 표현하기 어려운 감정과 마음을 그림과 다양한 미술 활동으로 자연스럽게 표현합니다. 그림을 잘 그리는 것과는 관계가 없습니다.',
     ['자기 마음을 말로 설명하기 어려워하는 아동 · 청소년', '소극적이고 자신감이 줄어든 아이', '학업 스트레스와 친구 관계로 마음이 지친 청소년', '감정을 차분히 들여다보고 정리하고 싶은 성인', '부모와 자녀가 함께 관계를 돌아보고 싶은 가정'],
     '관심사와 정서 상태, 상담 목표에 따라 여러 미술 재료와 활동을 고릅니다. 작품을 완성하는 것이 목적이 아니라, 표현하는 과정에서 나타나는 경험을 함께 살펴보는 시간입니다.', True) +
prog('sand', 'sand.webp', 1536, 1024, '모래상자에 담는 마음', '모래놀이치료', '모래와 다양한 소품을 활용해 자신의 마음과 경험을 자유롭게 표현합니다. 언어로 설명하기 어려운 감정을 안전하게 탐색하고 내면의 힘을 발견해 갑니다.',
     ['불안이 높고 수줍음이 많은 아이', '특정 상황에서 말이 잘 나오지 않아 힘든 아동 · 청소년 · 성인', '상실이나 큰 변화를 겪고 마음을 돌볼 시간이 필요한 분', '말로 하는 상담이 부담스럽게 느껴지는 분'],
     '아이도 어른도 할 수 있습니다. 모래상자 안에 원하는 대로 장면을 꾸미고, 상담사는 그 과정을 곁에서 함께하며 상징과 이미지에 담긴 마음을 살펴봅니다.') +
prog('adult', 'detail.webp', 1672, 941, '관계의 어려움과 마음의 고민을', '부부 · 성인 상담', '마음이 지치고 복잡할 때, 나의 감정과 고민을 차분히 돌아보는 상담입니다. 관계 · 감정 · 스트레스 등 지금의 어려움을 함께 살펴봅니다.',
     ['우울 · 불안 · 공황으로 일상이 힘든 분', '대인관계와 직장생활 스트레스가 큰 분', '같은 감정의 어려움이 반복되는 분', '같은 문제로 계속 다투게 되는 부부', '양육 스트레스로 지친 부모'],
     '충분한 초기 상담으로 지금의 상태와 상담 목표를 함께 정리합니다. 필요에 따라 미술 · 모래놀이 같은 표현 매체와 TCI 기질성격검사를 함께 활용합니다.', True) + f'''
    </div>
  </section>

  <section class="sec sec-warm" id="more">
    <div class="wrap">
      <div class="sec-head center" data-reveal>
        <span class="eyebrow">함께 운영하는 프로그램</span>
        <h2>검사 · 비대면 상담 · <em>소그룹 프로그램</em></h2>
      </div>
      <div class="cards3 cards-more">
        <div class="card" data-reveal><h3>TCI 기질 · 성격검사</h3><p>타고난 기질과 성격을 이해하는 검사와 해석 상담입니다. 나와 아이, 연인 · 부부가 서로의 차이를 이해하는 데 활용합니다. 비대면으로도 받으실 수 있습니다.</p><p class="card-fee">검사 + 해석 상담 <b>39,000원</b></p></div>
        <div class="card" data-reveal><h3>전화 · 화상(Zoom) 상담</h3><p>시간이나 거리 때문에 방문이 어려운 청소년 · 성인을 위한 비대면 상담입니다. 목소리만으로 편안하게 나누는 전화 상담과, 얼굴을 마주 보는 화상 상담 중에서 고르실 수 있습니다.</p></div>
        <div class="card" data-reveal><h3>미술치료 체험 (50분)</h3><p>‘내 마음 알아보기’ 일일 체험입니다. 상담이 처음이라 망설여질 때, 미술 활동으로 가볍게 시작해 보실 수 있습니다.</p></div>
        <div class="card" data-reveal><h3>아동 심리미술 원데이클래스</h3><p>초등학생을 위한 월별 심리미술 수업입니다. ‘나만의 마음나무 만들기’, ‘내 마음의 정원 만들기’처럼 만들기를 통해 마음을 표현합니다.</p></div>
        <div class="card" data-reveal><h3>느린학습자 소그룹</h3><p>초등 4~6학년 느린학습자를 위한 사회성 · 학습전략 프로그램입니다. 인지 · 미술 통합 활동으로 함께 배우고 함께 자랍니다.</p></div>
        <div class="card" data-reveal><h3>한부모 · 조손가정 정서지원</h3><p>한부모 · 조손가정 아동과 청소년을 위한 놀이 · 미술 · 모래놀이 통합 프로그램입니다. 총 12회기, 회기당 50분으로 진행합니다.</p><p class="card-fee">회기당 <b>1만원</b></p></div>
      </div>
      <p class="fine center" data-reveal>프로그램은 모집 시기에 따라 달라집니다. 지금 모집 중인 프로그램은 네이버 예약이나 문자로 문의해 주세요. 심리검사는 의학적 진단을 위한 검사가 아닙니다.</p>
    </div>
  </section>''' + cta())

# ───────────────────────── 공간안내
def sp(img, w, h, cap, cls=''):
    return f'<figure class="{cls}" data-reveal><img src="images/{img}" width="{w}" height="{h}" loading="lazy" alt="{cap}"><figcaption>{cap}</figcaption></figure>'
page('space.html', '공간안내', '늘해랑심리상담센터 공간안내 — 조용하고 독립된 상담실, 놀이 · 모래놀이실, 대기 공간.',
banner('hero.webp', '공간안내', '마음이 편안해지는 공간', '상담을 시작하기 전 가장 먼저 마주하는 것은 공간입니다. 조용히, 그러나 분명하게 편안함을 드리고 싶었습니다') + f'''

  <section class="sec">
    <div class="wrap">
      <article class="room" data-reveal>
        <div class="room-ph"><img src="images/hero.webp" width="1672" height="941" loading="lazy" alt="오후 햇살이 드는 상담실"></div>
        <div class="room-tx">
          <span class="eyebrow">상담실</span>
          <h2>한 사람에게만<br><em>집중하는 방</em></h2>
          <p>마주 앉은 의자 두 개와 작은 탁자. 꼭 필요한 것만 두어 이야기에 집중할 수 있게 했습니다. 모든 상담은 예약제로 진행되어, 다른 분과 마주치는 일 없이 편안하게 머무실 수 있습니다.</p>
        </div>
      </article>
      <article class="room flip" data-reveal>
        <div class="room-ph"><img src="images/play.webp" width="1536" height="1024" loading="lazy" alt="놀이 · 모래놀이실"></div>
        <div class="room-tx">
          <span class="eyebrow">놀이 · 모래놀이실</span>
          <h2>아이의 마음을<br><em>기다릴 수 있는 공간</em></h2>
          <p>아이들이 이 공간에서 무엇을 먼저 느꼈으면 좋을지 많이 생각했습니다. 선반 가득한 소품과 모래상자, 놀이 텐트와 둥근 러그까지. “잘해야 하는 곳”이 아니라 마음껏 표현해도 되는 곳입니다.</p>
        </div>
      </article>
    </div>
  </section>

  <section class="sec sec-warm">
    <div class="wrap">
      <div class="sec-head center" data-reveal>
        <span class="eyebrow">구석구석 둘러보기</span>
        <h2>문을 열고 들어와 <em>상담실에 앉기까지</em></h2>
      </div>
      <div class="gal">
        {sp('door.webp', 1086, 1448, '들어오는 문', 'tall')}
        {sp('wait.webp', 1536, 1024, '대기 공간', 'wide')}
        {sp('hall.webp', 1086, 1448, '복도', 'tall')}
        {sp('sand.webp', 1536, 1024, '모래상자와 소품', 'wide')}
        {sp('play.webp', 1536, 1024, '놀이 · 모래놀이실', 'wide')}
        {sp('desk.webp', 1086, 1448, '검사 · 상담실', 'tall')}
        {sp('detail.webp', 1672, 941, '상담실 의자', 'wide')}
        {sp('room2.webp', 1086, 1448, '상담실', 'tall')}
        {sp('room.webp', 1536, 1024, '상담실', 'wide')}
      </div>
      <ul class="space-facts" data-reveal>
        <li><b>독립된 상담 공간</b>이야기가 밖으로 새지 않는 조용한 방</li>
        <li><b>보호자 대기 공간</b>아이 상담 동안 편히 기다리실 수 있습니다</li>
        <li><b>무료 주차</b>벽산종합상가 지하 주차장</li>
        <li><b>상계역 도보 3분</b>4호선 5번 출구 앞</li>
      </ul>
    </div>
  </section>''' + cta('조용하고 편안한 공간에서, 천천히 마음을 들여다보세요.'))

# ───────────────────────── 이용안내
def faq(q, a): return f'<details class="faq" data-reveal><summary>{q}</summary><div><p>{a}</p></div></details>'
page('guide.html', '이용안내', '늘해랑심리상담센터 이용안내 — 상담 과정, 예약 방법, 상담 시간, 비용과 상담비 지원제도, 자주 묻는 질문.',
banner('wait.webp', '이용안내', '처음 오시는 분께', '예약부터 상담이 끝날 때까지, 궁금하실 내용을 모았습니다') + f'''

  <section class="sec" id="process">
    <div class="wrap">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">상담 과정</span>
        <h2>상담은 <em>이렇게</em> 진행됩니다</h2>
        <p>내담자 한 분 한 분의 상황과 속도를 존중하며 아래 흐름으로 진행합니다.</p>
      </div>
      <ol class="steps">
        <li class="step" data-reveal><h3>상담 예약</h3><p>네이버 예약이나 문자 · 전화로 예약합니다. 원하시는 요일과 시간, 상담을 고민하게 된 이유를 간단히 알려 주시면 안내해 드립니다.</p></li>
        <li class="step" data-reveal><h3>초기 상담</h3><p>지금 겪고 있는 어려움과 마음 상태를 함께 이야기합니다. 상담이 어떤 방향으로 진행되면 좋을지, 지금 상황에 상담이 알맞은지 함께 정리합니다.</p></li>
        <li class="step" data-reveal><h3>상담 진행</h3><p>목표와 필요에 맞춰 상담을 이어 갑니다. 자신을 이해하고 감정을 정리하며 삶의 변화를 차분히 만들어 가는 과정으로, 속도와 방식은 상황에 따라 조정합니다.</p></li>
        <li class="step" data-reveal><h3>상담 종결</h3><p>상담 목표가 충분히 정리되었거나 한 단계 마무리되었다고 느껴질 때 종결합니다. 종결 시점과 이후의 방향도 충분히 상의해 결정합니다.</p></li>
      </ol>
    </div>
  </section>

  <section class="sec sec-warm" id="reserve">
    <div class="wrap">
      <div class="sec-head center" data-reveal>
        <span class="eyebrow">예약 방법</span>
        <h2>모든 상담은 <em>사전 예약</em>으로 진행합니다</h2>
        <p>한 분 한 분의 상황에 맞는 상담을 위해 충분한 준비 시간을 두고 예약을 받습니다.</p>
      </div>
      <div class="cards3">
        <a class="card card-link" href="{NAVER}" target="_blank" rel="noopener" data-reveal><i class="num hand">추천</i><h3>네이버 예약</h3><p>원하시는 상담 종류와 시간을 바로 고르실 수 있습니다. 밤에도 예약하실 수 있고, 첫 상담 20% 할인이 적용됩니다.</p><span class="more">네이버로 예약하기{ARROW}</span></a>
        <a class="card card-link" href="sms:01067934899" data-reveal><i class="num hand">문자</i><h3>010-6793-4899</h3><p>상담 중에는 통화가 어렵습니다. 문자를 남겨 주시면 확인하는 대로 차례로 연락드립니다. 부재중이어도 반드시 답변드립니다.</p><span class="more">문자 보내기{ARROW}</span></a>
        <a class="card card-link" href="https://talk.naver.com/w6xgyqp" target="_blank" rel="noopener" data-reveal><i class="num hand">톡톡</i><h3>네이버 톡톡</h3><p>글로 편하게 물어보고 싶으실 때 이용해 주세요. 상담 가능 시간과 진행 방법을 안내해 드립니다.</p><span class="more">톡톡으로 문의하기{ARROW}</span></a>
      </div>
      <div class="hours-box" data-reveal>
        <h3>상담 시간</h3>
        <dl><div><dt>월 – 금</dt><dd>10:00 – 22:00</dd></div><div><dt>토요일</dt><dd>10:00 – 19:00</dd></div><div><dt>일요일</dt><dd>둘째 · 넷째 주 상담</dd></div></dl>
        <p>평일 저녁과 토요일에도 상담합니다. 학교와 학원, 직장 때문에 평일 낮 시간이 어려운 분도 편하게 예약해 주세요.</p>
      </div>
    </div>
  </section>

  <section class="sec" id="fee">
    <div class="wrap">
      <div class="sec-head" data-reveal>
        <span class="eyebrow">비용과 지원제도</span>
        <h2>비용 때문에 <em>망설이지 않으시도록</em></h2>
      </div>
      <div class="fee">
        <div class="fee-box" data-reveal>
          <h3>상담 비용</h3>
          <dl>
            <div><dt>아동 상담 (1회 50분)</dt><dd>60,000원</dd></div>
            <div><dt>TCI 기질 · 성격검사 + 해석 상담</dt><dd>39,000원</dd></div>
            <div><dt>성인 · 부부 상담</dt><dd>문의</dd></div>
          </dl>
          <p class="note">지역화폐(카드형 · 지류형) · 제로페이 · 간편결제를 쓰실 수 있습니다. 자세한 비용은 예약 때 안내해 드립니다.</p>
        </div>
        <div class="fee-box fee-sup" data-reveal>
          <h3>상담비 지원제도</h3>
          <p>상담이 필요하지만 비용 부담으로 시작이나 지속이 어려운 가정을 위해 센터가 직접 지원합니다.</p>
          <ul>
            <li><span>특별지원 — 수급 · 차상위 · 한부모 · 조손가정</span><b>30%</b></li>
            <li><span>일반지원 — 기준 중위소득 120% 이하 가정</span><b>20%</b></li>
          </ul>
          <p class="note">아동 상담 60,000원 기준 30% 지원 시 42,000원, 20% 지원 시 48,000원입니다(성인은 별도 문의). 정부 · 지자체 바우처가 아닌 센터 자체 제도입니다.</p>
        </div>
      </div>
      <div class="sup" data-reveal>
        <div>
          <h3>지원 신청 방법</h3>
          <ol class="sup-steps"><li><b>문의</b>지원제도 상담</li><li><b>가구원 수 확인</b>가족 구성 확인</li><li><b>증빙서류 제출</b>해당 서류 1가지</li><li><b>지원 대상 확인</b>확인 후 안내</li><li><b>상담 진행</b>지원 금액으로 진행</li></ol>
        </div>
        <div>
          <h3>제출 서류</h3>
          <ul class="dots"><li><b>일반지원(20%)</b> 건강보험료 납부확인서(최근 1개월분)</li><li><b>특별지원(30%)</b> 수급자증명서, 차상위계층확인서, 한부모가족증명서, 조손가정 확인서 등 해당 서류 1가지</li><li>모든 서류는 최근 1개월 이내 발급분</li></ul>
        </div>
      </div>
      <div class="coupon" data-reveal>
        <span class="coupon-pc" aria-hidden="true">%</span>
        <div><b>첫 상담 <em>20% 할인</em></b><span>네이버 예약 후 방문하시면 적용됩니다.</span></div>
        <a class="btn btn-main" href="{NAVER}" target="_blank" rel="noopener">네이버로 예약하기{GO}</a>
      </div>
    </div>
  </section>

  <section class="sec sec-warm" id="faq">
    <div class="wrap narrow">
      <div class="sec-head center" data-reveal>
        <span class="eyebrow">자주 묻는 질문</span>
        <h2>상담을 시작하기 전에 <em>궁금한 것들</em></h2>
      </div>
      {faq('상담은 몇 번 정도 받아야 하나요?', '사람마다 다릅니다. 초기 몇 회기는 어려움을 이해하고 상담사와 신뢰를 쌓으며 목표를 구체화하는 과정일 수 있습니다. 그래서 3~5회기에 뚜렷한 변화가 느껴지지 않는다고 해서 효과가 없다고 단정하기는 어렵습니다. 진행하면서 목표와 과정을 함께 점검하고, 필요하면 종결이나 다른 지원 방향도 상의합니다.')}
      {faq('꼭 진단을 받았을 때만 상담을 받나요?', '아닙니다. 상담은 특정 진단을 받았을 때만 필요한 과정이 아닙니다. 일상에서 반복되는 어려움이나 마음의 부담이 있을 때, 그 상태를 함께 이해하고 정리해 보는 시간이 될 수 있습니다.')}
      {faq('아이가 상담실에서 아무 말도 안 하면 어떡하죠?', '괜찮습니다. 상담의 시작부터 모든 마음을 말로 설명해야 하는 것은 아닙니다. 놀이 · 그림 · 모래상자처럼 말이 아닌 방법으로 표현할 수 있고, 그 경험이 상담에 참여하는 데 도움이 됩니다.')}
      {faq('아이 상담을 하면 부모 상담도 하나요?', '네. 아동 · 청소년 상담에서는 필요에 따라 부모 상담을 함께 진행합니다. 아동 상담은 4회기를 진행한 뒤 정기적인 부모 상담을 따로 갖고, 아이의 어려움뿐 아니라 가족 관계와 환경까지 함께 살펴봅니다.')}
      {faq('상담 내용은 비밀이 지켜지나요?', '모든 상담은 사전 예약제로 운영하며, 상담 내용의 비밀보장을 중요하게 생각합니다. 다만 본인이나 다른 사람의 안전이 위험한 경우, 아동학대처럼 법으로 신고가 정해진 경우에는 예외가 될 수 있으며, 이 내용은 상담을 시작할 때 다시 안내해 드립니다.')}
      {faq('직접 가기 어려운데 비대면으로도 되나요?', '청소년과 성인은 전화 또는 화상(Zoom) 상담을 받으실 수 있습니다. 주변의 방해를 받지 않는 공간과 안정적인 인터넷 연결을 준비해 주세요. 긴급한 정신건강 지원이 필요한 경우에는 가까운 의료기관이나 위기지원 서비스의 도움이 우선입니다.')}
      {faq('주차할 수 있나요?', '벽산종합상가 지하 주차장을 무료로 이용하실 수 있습니다. 벽산아파트 정문으로 들어와 108동 쪽으로 직진한 뒤 왼쪽 지하 주차장으로 내려오세요.')}
      {faq('예약 시간을 바꾸고 싶어요.', '예약 변경이 필요하시면 미리 문자(010-6793-4899)로 알려 주세요. 확인하는 대로 가능한 시간을 안내해 드립니다.')}
    </div>
  </section>''' + cta())

# 게시판 · 회원 화면 틀
lay = HEAD.replace('<body class="sub">', '<body>') + '<main id="main" class="sub-main"></main>\n\n' + FOOT
lay = re.sub(r'(href|src)="(?!https?:|/|#|tel:|sms:|mailto:)([^"]+)"', lambda m: '%s="/%s"' % (m.group(1), '' if m.group(2) == './' else m.group(2)), lay)
(R / '_layout.html').write_text(lay, encoding='utf-8', newline='\n')
print('_layout.html')
