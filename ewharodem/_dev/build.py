"""이화아동발달연구소의 모든 html 을 찍는다:  python ewharodem/_dev/build.py
   글을 고쳤으면 이어서 python ewharodem/_dev/build-fonts.py (그리고 kit.FV · style.css 의 글꼴 ?v= 올림)"""
import sys, importlib
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import kit
from home import home
kit.write("index", home())
for mod in ("pages_program", "pages_about", "pages_guide"):
    try: m = importlib.import_module(mod)
    except ModuleNotFoundError as ex:
        if ex.name != mod: raise
        print("아직 없음", mod); continue
    for file, html in m.pages(): kit.write(file, html)
# 게시판 · 회원 화면이 들어올 틀(머리 · 빈 main · 꼬리)
kit.write("_layout", kit.doc("_layout", kit.SITE, kit.SITE, '<main id="main" class="board-main"><div class="wrap"></div></main>\n', body_cls="inner", noindex=True))
