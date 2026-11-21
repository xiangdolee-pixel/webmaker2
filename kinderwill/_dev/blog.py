"""네이버 블로그 최신 글을 받아 _dev/blog.json 과 images/blog/*.webp 로 둔다 (build.py 가 html 에 넣는다).
   실행: python kinderwill/_dev/blog.py   필요: pip install pillow"""
import re, json, io, hashlib, urllib.request
from pathlib import Path
from email.utils import parsedate_to_datetime
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / "images" / "blog"; OUT.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "Referer": "https://blog.naver.com/"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read()
cd = lambda tag, s: (re.search(rf"<{tag}>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>", s, re.S) or [None, ""])[1].strip()
xml = get("https://rss.blog.naver.com/kinderwill.xml").decode("utf-8")
items = []
for it in re.findall(r"<item>(.*?)</item>", xml, re.S)[:24]:
    raw = cd("title", it).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    title = re.sub(r"^\s*(?:\[[^\]]*\]|<[^>]*>)\s*", "", raw).strip() or re.sub(r"[\[\]<>]", "", raw).strip()   # 제목 앞 검색어 묶음 [노원구 …] · <노원구 …> 은 뗀다
    title = re.sub(r"\s+", " ", title)
    link = cd("link", it).split("?")[0]; desc = cd("description", it)
    date = parsedate_to_datetime(cd("pubDate", it)).strftime("%Y-%m-%d")
    cat = cd("category", it).split(",")[0].strip() or "킨더윌 이야기"
    m = re.search(r'<img src="([^"]+)"', desc); name = ""
    if m:
        try:
            src = re.sub(r"\?type=\w+$", "?type=w2", m.group(1))
            im = Image.open(io.BytesIO(get(src))).convert("RGB"); im.thumbnail((720, 720))
            name = hashlib.md5(link.encode()).hexdigest()[:10] + ".webp"; im.save(OUT / name, "WEBP", quality=78)
        except Exception as ex: print("썸네일 실패", title[:20], ex); name = ""
    text = re.sub(r"<[^>]+>", "", desc); text = re.sub(r"\s+", " ", text).strip()[:110]
    items.append(dict(title=title, link=link, date=date, cat=cat, img=name, text=text))
keep = {x["img"] for x in items if x["img"]}
for f in OUT.glob("*.webp"):
    if f.name not in keep: f.unlink()
(ROOT / "_dev" / "blog.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
# 그림 크기 표에 더한다
sz = ROOT / "_dev" / "sizes.json"; S = json.loads(sz.read_text(encoding="utf-8")) if sz.exists() else {}
S = {k: v for k, v in S.items() if not k.startswith("blog/")}
for f in OUT.glob("*.webp"): S["blog/" + f.name] = list(Image.open(f).size)
sz.write_text(json.dumps(S, ensure_ascii=False), encoding="utf-8")
print("블로그 글", len(items), "썸네일", len(keep))
