"""사이트에 실제로 쓰인 글자만 담아 글꼴 두 파일을 만든다 (속도 · 새로고침 때 글꼴이 바뀌어 보이지 않게 — 둘 다 preload)
   ① fonts/ew-pretendard.woff2 — 본문 Pretendard(SIL OFL). 사이트의 모든 글자
   ② fonts/ew-head.woff2 — 제목용 마루 부리 Bold(네이버, SIL OFL 1.1). h1 · h2 · 큰 숫자 · 인용문 등 css 의 var(--font-h)
   까닭: 바깥(jsdelivr) 글꼴 CSS 가 렌더를 막고 조각 17개(약 430KB)를 받았다 → 한 파일씩 미리 받는다.
   빠진 글자(게시판 · 회원 화면에 새로 적히는 글 등)는 뒤늦게 불러오는 바깥 Pretendard 가 채운다.
   실행: python ewharodem/_dev/build-fonts.py   (글을 고쳐 build.py 를 돌린 뒤 다시 실행하고, kit.FV 와 style.css 의 ?v= 를 올린다)   필요: pip install fonttools brotli
   원본은 jsdelivr 에서 받아 임시 폴더에 둔다."""
import re, tempfile, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
R = Path(__file__).resolve().parents[1]
def fetch(name, url):
    f = Path(tempfile.gettempdir()) / name
    if not f.exists(): urllib.request.urlretrieve(url, f)
    return f
strip = lambda t: re.sub(r"<[^>]+>", " ", t)
htmls = [f.read_text(encoding="utf-8") for f in R.glob("*.html")]
text = ""
for t in htmls + [f.read_text(encoding="utf-8") for f in list((R / "js").glob("*.js")) + list((R / "_dev").glob("*.py")) + list((R / "_dev").glob("*.json"))]:
    text += re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", t)
chars = set(ch for ch in text if ord(ch) >= 0x20)
chars |= set(chr(c) for c in range(0x20, 0x7F))
chars |= set("·…—–~‘’“”「」『』〈〉《》※→←↑↓○●□■△▲▽▼☆★♥✓×÷±°′″₩€αβ①②③④⑤⑥⑦⑧⑨⑩")
# 게시판 · 회원 화면에 자주 나오는 말(로그인 · 글쓰기 등)도 미리
chars |= set("로그인아웃회원가입비밀번호이메일인증확인취소저장수정삭제글쓰기목록검색제목내용작성자날짜조회답글댓글첨부파일다음이전처음마지막페이지관리내정보유지보수요청문의접수완료오류다시시도")

def save(font, name, keep):
    opt = subset.Options(); opt.flavor = "woff2"; opt.layout_features = ["kern", "ccmp", "locl", "mark", "mkmk", "tnum", "calt", "liga"]; opt.hinting = False; opt.desubroutinize = True; opt.name_IDs = [1, 2]; opt.notdef_outline = True
    s = subset.Subsetter(opt); s.populate(text="".join(sorted(keep))); s.subset(font)
    return opt

# ① 본문
font = TTFont(str(fetch("PretendardVariable.woff2", "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2")))
opt = save(font, "ew-pretendard.woff2", chars)
try: font = instancer.instantiateVariableFont(font, {"wght": (500, 700)})              # 쓰는 굵기 범위만(400 ~ 800)
except Exception as ex: print("굵기 범위 줄이기는 건너뜀:", str(ex)[:80])
(R / "fonts").mkdir(exist_ok=True); out = R / "fonts" / "ew-pretendard.woff2"
subset.save_font(font, str(out), opt)
print(out.name, out.stat().st_size // 1024, "KB", "글자", len(chars))

# ② 제목: 같은 글자 묶음을 그대로 담는다(제목에 쓰인 글자만 고르면 글을 고칠 때마다 빠지는 글자가 생긴다 — 전부 담아도 60KB 안팎)
hc = set(chr(c) for c in range(0x20, 0x7F)) | set("·…—–~‘’“”→")
for t in htmls:   # 제목 글꼴이 걸리는 자리(h1 · h2 · h3 · 인용문 · 굵은 글 · 서랍 메뉴 제목)의 글자만 — 빠진 글자는 본문 글꼴로 나오니 새 자리에 --font-h 를 쓰면 여기에도 더한다
    for m in re.finditer(r"<(h1|h2|h3|blockquote|strong|b|dt)\b[^>]*>([\s\S]*?)</\1>|class=\"(?:dr-one|strip-say|hp-tel)\"[^>]*>([^<]*)<|<div class=\"dr-grp\"><p>([^<]*)<", t):
        hc |= set(ch for ch in strip("".join(x or "" for x in m.groups()[1:])) if ord(ch) >= 0x20)
font = TTFont(str(fetch("MaruBuri-Bold.woff2", "https://hangeul.pstatic.net/hangeul_static/webfont/MaruBuri/MaruBuri-Bold.woff2")))
have = set(chr(c) for c in font.getBestCmap())
miss = sorted(ch for ch in hc if ch not in have and not ch.isspace())
opt = save(font, "ew-head.woff2", hc & have)
out = R / "fonts" / "ew-head.woff2"; subset.save_font(font, str(out), opt)
print(out.name, out.stat().st_size // 1024, "KB", "글자", len(hc & have), "| 이 글꼴에 없어 본문 글꼴로 나오는 글자:", "".join(miss) or "없음")
