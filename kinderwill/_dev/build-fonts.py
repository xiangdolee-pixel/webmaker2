"""Pretendard 를 사이트에 실제로 쓰인 글자만 담아 fonts/kw-pretendard.woff2 한 개로 만든다 (2026-11-22, 속도)
   까닭: 바깥(jsdelivr) 글꼴 CSS 가 렌더를 막고 조각 17개(약 430KB)를 받았다 → 한 파일을 미리 받는다(preload).
   빠진 글자(게시판 · 회원 화면에 새로 적히는 글 등)는 뒤늦게 불러오는 바깥 Pretendard 가 채운다.
   실행: python kinderwill/_dev/build-fonts.py   (글을 고쳐 build.py 를 돌린 뒤 다시 실행)   필요: pip install fonttools brotli
   원본: PretendardVariable.woff2 (SIL OFL) — 없으면 jsdelivr 에서 받아 _dev 밖 임시 폴더에 둔다."""
import re, io, os, tempfile, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
R = Path(__file__).resolve().parents[1]
src = Path(tempfile.gettempdir()) / "PretendardVariable.woff2"
if not src.exists():
    urllib.request.urlretrieve("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2", src)
text = ""
for f in list(R.glob("*.html")) + list((R / "js").glob("*.js")) + list((R / "_dev").glob("*.py")) + list((R / "_dev").glob("*.json")):
    text += re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", f.read_text(encoding="utf-8"))
chars = set(ch for ch in text if ord(ch) >= 0x20)
chars |= set(chr(c) for c in range(0x20, 0x7F))
chars |= set("·…—–~‘’“”「」『』〈〉《》※→←↑↓○●□■△▲▽▼☆★♥✓×÷±°′″₩€αβ①②③④⑤⑥⑦⑧⑨⑩")
# 게시판 · 회원 화면에 자주 나오는 말(로그인 · 글쓰기 등)도 미리
chars |= set("로그인아웃회원가입비밀번호이메일인증확인취소저장수정삭제글쓰기목록검색제목내용작성자날짜조회답글댓글첨부파일다음이전처음마지막페이지관리내정보유지보수요청문의접수완료오류다시시도")
font = TTFont(str(src))
opt = subset.Options(); opt.flavor = "woff2"; opt.layout_features = ["*"]; opt.name_IDs = [1, 2]; opt.notdef_outline = True
s = subset.Subsetter(opt); s.populate(text="".join(sorted(chars))); s.subset(font)      # 먼저 글자를 줄이고
try: font = instancer.instantiateVariableFont(font, {"wght": (400, 800)})              # 쓰는 굵기 범위만(400 ~ 800)
except Exception as ex: print("굵기 범위 줄이기는 건너뜀:", str(ex)[:80])
(R / "fonts").mkdir(exist_ok=True); out = R / "fonts" / "kw-pretendard.woff2"
subset.save_font(font, str(out), opt)
print(out.name, out.stat().st_size // 1024, "KB", "글자", len(chars))
