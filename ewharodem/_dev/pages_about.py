"""연구소 4쪽: 소개 · 걸어온 길 / 함께하는 사람들 / 공간 / 오시는 길"""
from kit import *
import sym

def about():
    hist = [("2003", "3월", "이화로뎀나무교육원 개원", "서울 창동"), ("2007", "9월", "이화아동발달연구소로 이름을 바꾸고 이전", "서울 상계동"),
            ("2011", "8월", "발달재활서비스 제공기관 선정", "발달재활서비스 · 언어발달지원서비스 시작"), ("2012", "3월", "교육청 특수교육 치료지원 서비스 제공기관 지정", ""),
            ("2012", "8월", "서울시 지역사회서비스투자사업 아동심리지원 서비스 제공기관 선정", ""), ("2013", "8월", "영유아발달지원 서비스 제공기관 선정 · 노원구 드림스타트 협력기관 협약", ""),
            ("2014", "3월", "연구소 이전", "서울 중계동"), ("2018", "10월", "지금의 자리로 이전", "서울 상계동 한글비석로 444")]
    tl = '<ol class="tl">' + "".join(f'<li class="rv"><b>{y}</b><div><p class="tl-m">{m}</p><h3>{t}</h3>{f"<p>{d}</p>" if d else ""}</div></li>' for y, m, t, d in hist) + "</ol>"
    body = sec(f'''<div class="duo"><div>{tag("소개")}<h2><span class="nb">아동 · 청소년을 아우르는</span> <span class="nb">특수교육 전문기관</span></h2>
<div class="prose"><p>이화아동발달연구소는 서울 노원구에 있는 아동 · 청소년 특수교육 전문기관입니다.</p>
<p>2003년 특수교육 전문기관인 이화로뎀나무교육원으로 문을 열었고, 2007년 교육원을 넓혀 옮기면서 설립 목적이 잘 드러나도록 이화아동발달연구소로 이름을 바꾸었습니다. 지금은 여러 영역의 선생님들과 함께 아이들을 위한 교육과 연구를 이어 가고 있습니다.</p>
<p>아이의 발달은 속도의 차이가 있을 뿐, 각자 다른 방식으로 성장합니다. 연구소는 언어 · 인지 · 미술 · 음악 영역에서 아이들이 자신의 방식으로 세상과 소통하고, 일상 속에서 더 독립적이고 의미 있는 삶을 살아가도록 함께합니다.</p></div></div>
<div class="rv">{figure("lobby", "연구소 입구 — 간판과 치료실 문", "연구소 입구", sizes="(max-width: 760px) 100vw, 600px")}</div></div>''')
    body += sec(head("약속", "<span class=\"nb\">아이 한 명, 한 명의</span> <span class=\"nb\"><em class=\"mark\">속도와 가능성</em>을 존중합니다</span>") + cards([
        ("아이마다 다르게", "발달 특성과 강점을 살펴, 아이마다 목표를 정하고 수업합니다."), ("근거를 바탕으로", "임상 근거에 바탕을 둔 알맞은 수업을 하려고 선생님들이 꾸준히 배웁니다."), ("가족과 함께", "배운 것이 집에서도 이어지도록 보호자와 이야기합니다.")], "box"), "sec-soft")
    body += sec(head("걸어온 길", "<span class=\"nb\">2003년부터</span> <span class=\"nb\">지금까지</span>") + tl)
    body += sec(head("지정 현황", "<span class=\"nb\">바우처를 쓸 수 있는</span> <span class=\"nb\">제공기관입니다</span>", "", ("바우처 · 비용 보기", href("voucher"))) + checks(["발달재활서비스 (보건복지부) — 2011년부터", "특수교육 치료지원 서비스 · 굳센카드 (교육청) — 2012년부터"]), "sec-soft")
    body += call_band()
    return subpage("about", "<span class=\"nb\">소개 · 걸어온 길</span>", "2003년 이화로뎀나무교육원으로 시작해, 스무 해 넘게 아이들과 함께해 왔습니다.", body, shape="a")

def team():
    def person(role, name, years, edu, career, certs, cls=""):
        return f'<article class="pf rv {cls}"><div class="pf-top"><p class="role">{role}</p><h3>{name}</h3><p class="pf-y"><b>{years}</b>임상 경력</p></div><div class="pf-body">{kv([("학력", edu), ("경력", career)], "slim")}<p class="pf-h">자격 · 전문 과정</p>{dots(certs)}</div></article>'
    lead = person("원장", "서도희", "30년 이상", "이화여자대학교 특수교육학 학사", "前 명현학교 특수교사<br>前 이화로뎀나무교육원 원장",
        ["특수학교 정교사 2급 (교육부) · 경기도 임용고시 합격", "응용행동분석사(ABA) 1급 (한국인지행동심리학회)", "인지행동지도사 1급 (한국인지행동심리학회)", "심리발달평가사 2급 (한국인지행동심리학회)", "학습장애(난독증) 교육상담사 1급 (한국인지행동심리학회)"])
    lead += person("부원장", "황진태", "30년 이상", "이화여자대학교 특수교육학 학사", "前 홀트학교 특수교사",
        ["특수학교 정교사 2급 (교육부)", "인지행동지도사 1급 (한국인지행동심리학회)", "심리발달평가사 2급 (한국인지행동심리학회)"], "alt")
    def staff(icon, team_name, members):
        rows = "".join(f'<li class="rv"><p class="st-n">{n}</p><p class="st-y">{y}</p>{dots(c)}</li>' for n, y, c in members)
        return f'<div class="st"><div class="st-head"><span class="t-ic">{sym.icon(icon)}</span><h3>{team_name}</h3></div><ul>{rows}</ul></div>'
    teams = staff("talk", "언어재활팀", [
        ("언어재활사", "임상 경력 14년", ["언어재활사 1급", "심리발달평가사 2급", "보완대체의사소통(AAC) 전문가 양성과정 심화 수료", "언어치료학 학사"]),
        ("언어재활사", "임상 경력 7년", ["언어재활사 1급", "인지학습상담전문가 2급", "PECS Level 1 · 2 Training 수료", "DIR Floortime 101 과정 이수", "언어병리학 석사"]),
        ("언어재활사", "", ["언어재활사 1급 · 청소년상담사 2급", "인지행동지도사 1급", "문해교육전문가 기본 · 심화 과정 수료 (한국난독증협회)", "PECS Level 1 Training 수료", "언어병리학 석사 · 가정상담학 석사"])])
    teams += staff("note", "음악재활팀", [
        ("음악재활사", "임상 경력 20년", ["음악치료사 1급", "음악중재전문가", "인지행동지도사 1급", "음악치료 석사"]),
        ("음악재활사", "임상 경력 12년", ["음악치료 석사"])])
    teams += staff("brush", "미술재활팀", [
        ("미술재활사", "임상 경력 13년", ["미술심리지도사 1급", "컬러상담사 1급", "회화 전공"]),
        ("미술재활사", "임상 경력 13년", ["특수아미술실기지도사", "공예미술 전공"])])
    body = sec(head("원장 · 부원장", "<span class=\"nb\">특수학교 교실에서 시작한</span> <span class=\"nb\"><em class=\"mark\">30년</em>의 경험</span>", "두 분 모두 특수학교 교사로 아이들을 가르쳤고, 지금은 인지치료를 직접 맡고 있습니다.") + f'<div class="pfs">{lead}</div>')
    body += sec(head("치료진", "<span class=\"nb\">영역별로</span> <span class=\"nb\">일곱 명이 함께합니다</span>", "연구소 블로그에 공개된 내용을 옮겼습니다. 선생님 구성은 달라질 수 있습니다.") + f'<div class="sts">{teams}</div>', "sec-soft")
    body += call_band()
    return subpage("team", "<span class=\"nb\">함께하는 사람들</span>", "원장 · 부원장과 언어 · 음악 · 미술 재활사, 아홉 명이 아이들을 만납니다.", body, shape="b")

def space():
    G = [("lobby", "입구", "가운데 연구소 간판, 양옆으로 언어 · 인지치료실 문이 있습니다.", "w"), ("lounge", "대기실", "수업을 기다리는 보호자를 위한 자리입니다.", ""), ("hall", "복도", "치료실이 복도를 따라 이어집니다.", ""),
         ("speech1", "언어치료실", "교구와 책이 선반에 정리되어 있습니다.", ""), ("speech2", "언어치료실", "놀잇감을 쓰는 수업을 위한 방입니다.", ""), ("speech3", "언어치료실", "책상에 마주 앉아 수업합니다.", ""),
         ("cog1", "인지치료실", "교재와 교구가 놓인 책장과 책상.", ""), ("cog2", "인지치료실", "", ""), ("art", "미술치료실", "벽에 그림이 걸려 있습니다.", "w"), ("music", "음악치료실", "피아노와 기타가 있습니다.", "")]
    gal = '<div class="gal">' + "".join(f'<figure class="rv {c}">{img(n, t + " 사진", sizes="(max-width: 760px) 100vw, " + ("840px" if c else "420px"))}<figcaption><b>{t}</b>{f"<span>{d}</span>" if d else ""}</figcaption></figure>' for n, t, d, c in G) + "</div>"
    body = sec(head("공간", "<span class=\"nb\">교림노원프라자 3층,</span> <span class=\"nb\"><em class=\"mark\">파란 벽</em>의 교실들</span>", "입구와 대기실, 언어 · 인지 · 미술 · 음악 치료실이 있습니다. 사진은 연구소가 직접 찍어 공개한 것입니다.") + gal)
    body += call_band("직접 와서 둘러보세요", "전화로 예약한 뒤 방문 상담 때 공간을 보실 수 있습니다.")
    return subpage("space", "<span class=\"nb\">공간 둘러보기</span>", "아이들이 수업하는 치료실과 보호자가 기다리는 대기실입니다.", body, shape="a")

def location():
    info = kv([("주소", f"{ADDR}<br><small>지번 {ADDR_OLD} · 계상초등학교 맞은편, 궁전보석사우나가 있는 건물 3층</small>"), ("지하철", "4호선 상계역에서 걸어서 9분<br>7호선 마들역에서 걸어서 15분"), ("주차", "건물 주차장을 이용할 수 있습니다"), ("운영 시간", OPEN_HOURS), ("전화 문의", f"{CALL_HOURS}<br><small>수업 중에는 전화를 받지 못할 수 있습니다</small>")])
    body = sec(f'''<div class="visit">
  <div class="visit-map rv"><iframe title="{SITE} 지도" src="https://xim.plators.com/map?addr={e("서울 노원구 한글비석로 444")}&name={e(SITE)}&c=2f4880" loading="lazy"></iframe></div>
  <div class="visit-txt">{tag("오시는 길")}<h2><span class="nb">계상초등학교</span> <span class="nb">맞은편 3층</span></h2>{info}
    <div class="visit-btns">{btn("네이버 지도에서 보기", NMAP, "", "out", ' target="_blank" rel="noopener"')}</div>
  </div>
</div>''')
    body += sec(head("방문 전에", "<span class=\"nb\">예약한 뒤</span> <span class=\"nb\">방문해 주세요</span>") + steps([("전화로 예약", f"{TEL} · 전화 문의 {CALL_HOURS}"), ("3층 303호로", "건물 3층으로 올라오시면 연구소 입구가 보입니다."), ("대기실에서", "수업 동안 보호자는 대기실에서 기다리실 수 있습니다.")], "steps-3"), "sec-soft")
    body += call_band()
    return subpage("location", "<span class=\"nb\">오시는 길</span>", "서울 노원구 한글비석로 444 교림노원프라자 3층. 4호선 상계역에서 걸어서 9분입니다.", body, shape="b")

def pages(): return [("about", about()), ("team", team()), ("space", space()), ("location", location())]
