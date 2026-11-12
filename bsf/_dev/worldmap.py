# 점묘 세계지도 만들기 → bsf/images/world-dots.svg
#   지형 데이터: world-atlas@2 countries-110m (Natural Earth, 퍼블릭 도메인) — bsf/_src/world110.json 에 받아 둔다
#   투영: 등장방형, 경도 -170~190, 위도 78~-56 (gen.py 의 지도 좌표와 같아야 한다)
import json, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1600, 596
LON0, LAT0, LAT1 = -170, 78, -56
HIGHLIGHT = {'156': 'cn', '704': 'vn', '104': 'mm', '050': 'bd', '410': 'kr'}

def proj(lon, lat):
    if lon < LON0: lon += 360
    return (lon - LON0) / 360 * W, (LAT0 - lat) / (LAT0 - LAT1) * H

topo = json.load(open(os.path.join(ROOT, '_src', 'world110.json'), encoding='utf8'))
sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
arcs = []
for a in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)
def ring(idx):
    pts = []
    for i in idx:
        seg = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts

S = 4  # 그릴 때 해상도 배율
img = Image.new('L', (W * S, H * S), 0); d = ImageDraw.Draw(img)
COL = {'land': 1, 'cn': 2, 'vn': 3, 'mm': 4, 'bd': 5, 'kr': 6}
for g in topo['objects']['countries']['geometries']:
    key = HIGHLIGHT.get(str(g.get('id', '')).zfill(3), 'land')
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']] if g['type'] == 'Polygon' else []
    for poly in polys:
        for k, r in enumerate(poly):
            pts = ring(r)
            # 날짜변경선을 넘는 고리(러시아 · 피지)는 조각나므로 경도 차가 큰 곳에서 끊지 않고 그대로 — 바깥 고리만 채운다
            xy = [(proj(lon, lat)[0] * S, proj(lon, lat)[1] * S) for lon, lat in pts]
            if max(p[0] for p in xy) - min(p[0] for p in xy) > W * S * .6:  # 지도 끝에서 갈라진 고리는 건너뜀(아주 작은 조각)
                continue
            d.polygon(xy, fill=(COL[key] if k == 0 else 0))

STEP = 9
dots = {k: [] for k in COL}
inv = {v: k for k, v in COL.items()}
px = img.load()
for gy in range(STEP // 2, H, STEP):
    for gx in range(STEP // 2, W, STEP):
        v = px[gx * S, gy * S]
        if v: dots[inv[v]].append((gx, gy))
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">']
style = {'land': ('#8fbfdc', .62, 2.6), 'cn': ('#ff9640', 1, 3), 'vn': ('#ff9640', 1, 3), 'mm': ('#ff9640', 1, 3), 'bd': ('#ff9640', 1, 3), 'kr': ('#ffffff', 1, 3.2)}
for k, pts in dots.items():
    c, o, r = style[k]
    out.append(f'<g fill="{c}" fill-opacity="{o}">' + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y in pts) + '</g>')
out.append('</svg>')
open(os.path.join(ROOT, 'images', 'world-dots.svg'), 'w', encoding='utf8').write(''.join(out))
print({k: len(v) for k, v in dots.items()})
