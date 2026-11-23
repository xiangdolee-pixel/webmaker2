"""받은 사진을 한눈에 보는 모음판으로: python sheet.py <폴더>   → <폴더>/out/sheet1.jpg …
사진을 한 장씩 열어 보지 말고 모음판 2~3장만 본다(토큰 절약). 같은 그림(크기 · 내용 같은 것)은 한 번만 넣는다."""
import sys, glob, os, hashlib
from PIL import Image, ImageDraw, ImageOps
root = sys.argv[1]; W, H, C, PER = 300, 240, 6, 36
files, seen = [], set()
for f in sorted(glob.glob(os.path.join(root, 'img/place/*'))) + sorted(glob.glob(os.path.join(root, 'img/blog/*')), reverse=True):
    h = hashlib.md5(open(f, 'rb').read()).hexdigest()
    if h in seen: continue
    seen.add(h); files.append(f)
os.makedirs(os.path.join(root, 'out'), exist_ok=True)
for s in range(0, len(files), PER):
    part = files[s:s + PER]; rows = (len(part) + C - 1) // C
    sh = Image.new('RGB', (C * W, rows * (H + 22)), 'white'); d = ImageDraw.Draw(sh)
    for i, f in enumerate(part):
        try:
            im = Image.open(f); sz = im.size
            if im.mode in ('RGBA', 'LA', 'P'):   # 투명 그림(로고)은 회색 바탕에
                im = im.convert('RGBA'); bg = Image.new('RGB', im.size, (225, 225, 225)); bg.paste(im, mask=im.split()[-1]); im = bg
            im = ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((W - 8, H - 8))
        except Exception as e:
            print('못 엶', f, e); continue
        x, y = (i % C) * W, (i // C) * (H + 22); sh.paste(im, (x + 4, y + 4))
        d.text((x + 4, y + H), f"{os.path.basename(f)[:34]} {sz[0]}x{sz[1]}", fill='black')
    out = os.path.join(root, 'out', f'sheet{s // PER + 1}.jpg'); sh.save(out, quality=80); print(out, len(part))
