"""늘해랑 제목 · 손글씨 글꼴을 사이트에 실제로 쓰인 글자만 담아 작게 만든다 (2026-11-21)
   까닭: 구글 글꼴을 그대로 쓰면 새로고침할 때마다 제목이 다른 글꼴로 보였다가 바뀐다(사용자: "다른 폰트로 보이다가 바뀌어").
   → 쓰는 글자만 담은 파일(fonts/nh-batang.woff2 · nh-hand.woff2)을 사이트에 두고 미리 받아(preload) 처음부터 그 글꼴로 그린다.
   원본: 고운바탕 Bold · 나눔손글씨 펜 (둘 다 OFL) — _pc/neulhaerang/fonts/ 에 내려받아 둔 ttf.
   실행: python neulhaerang/_dev/build-fonts.py   (글을 고쳐 새 글자가 생기면 다시 실행 — 빠진 글자는 구글 글꼴에서 늦게 받아 온다)
   필요: pip install fonttools brotli"""
import re
from pathlib import Path
from fontTools import subset
R = Path(__file__).resolve().parents[1]
SRC = R.parents[0] / '_pc' / 'neulhaerang' / 'fonts'
text = ''
for f in list(R.glob('*.html')) + [R / '_dev' / 'build-pages.py']:
    text += re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', f.read_text(encoding='utf-8'))
chars = sorted(set(ch for ch in text if ch.strip() and ord(ch) >= 0x20))
chars = ''.join(chars) + ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,·…—–-~()[]{}“”‘’"\'!?:;/%&+=<>*#@₩원'
# 손글씨는 몇 군데에만 쓴다 → 그 자리의 글자만 담아 더 작게: class 에 hand 가 든 요소 · 서명 · 유리 카드의 하나/둘/셋/넷 · 상담 시간 옆 글
hand = ''
for pat in (r'class="[^"]*hand[^"]*"[^>]*>([\s\S]*?)</', r'class="prof-q[^"]*"[^>]*>([\s\S]*?)</', r'class="dir-sign"><b>([^<]*)</b>', r'class="whyc"[^>]*><i>([^<]*)</i>', r'<h2>상담 시간 <span>([^<]*)</span>', r"'(하나|둘|셋|넷|추천|문자|톡톡)'", r'hand">(하나|둘|셋|넷|추천|문자|톡톡)<'):
    for m in re.finditer(pat, text): hand += re.sub(r'<[^>]+>', '', m.group(1))
hand = ''.join(sorted(set(ch for ch in hand if ch.strip()))) + ' 0123456789.,·“”‘’"\'!?%~-—()하나둘셋넷'
(R / 'fonts').mkdir(exist_ok=True)
for src, out, chars in (('GowunBatang-Bold.ttf', 'nh-batang.woff2', chars), ('NanumPenScript-Regular.ttf', 'nh-hand.woff2', hand)):
    opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']; opt.name_IDs = [1, 2]; opt.notdef_outline = True; opt.desubroutinize = True
    font = subset.load_font(str(SRC / src), opt)
    s = subset.Subsetter(opt); s.populate(text=chars); s.subset(font)
    subset.save_font(font, str(R / 'fonts' / out), opt)
    print(out, (R / 'fonts' / out).stat().st_size // 1024, 'KB', '글자', len(set(chars)))
