"""킨더윌 사이트의 모든 html 을 찍는다:  python kinderwill/_dev/build.py
   (블로그 최신 글은 먼저 python kinderwill/_dev/blog.py 로 받아 둔다 — _dev/blog.json · images/blog/)"""
import sys, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import kit
from home import home
kit.write("index", home())
for mod in ("pages_about", "pages_program", "pages_therapy", "pages_kidstep", "pages_guide"):
    try: m = importlib.import_module(mod)
    except ModuleNotFoundError as ex:
        if ex.name != mod: raise
        print("아직 없음", mod); continue
    for file, html in m.pages(): kit.write(file, html)
# 게시판 · 회원 화면이 들어올 틀(머리 · 빈 main · 꼬리)
kit.write("_layout", kit.doc("_layout", "킨더윌", "킨더윌 사회성언어전문센터", '<main id="main" class="board-main"><div class="wrap"></div></main>\n', body_cls="sub", noindex=True))
