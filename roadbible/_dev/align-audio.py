"""이미 있는 음성(제작 기록이 없는 옛 음성)의 '읽는 자리' 시각 만들기 — 2026-11-21
   음성을 받아쓰기(faster-whisper small, CPU — GPU 는 TTS 가 쓰는 중)해 낱말 시각을 얻고, 본문 글자와 맞춰 절마다 시작 초를 구한다.
   → assets/audio/<이름>.json = {"id": "2", "v": [...]}  (id 는 음성 주소 번호 — 옛 음성은 AV 와 같은 "2" 라 다시 받지 않는다)
   이미 json 이 있는 장(새로 만든 음성)은 건드리지 않는다.
   실행: _pc/clone/.venv/Scripts/python.exe roadbible/_dev/align-audio.py [genesis deuteronomy …]"""
import sys, os, json, re, difflib, subprocess, time
CHECK = os.environ.get('CHECK')   # CHECK=1 → 이미 json 이 있는 장을 다시 재서 차이만 보여 준다(쓰지 않음)
from pathlib import Path
import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "roadbible/assets/audio"
SLUG = {"창세기": "genesis", "출애굽기": "exodus", "레위기": "leviticus", "민수기": "numbers", "신명기": "deuteronomy", "잠언": "proverbs", "전도서": "ecclesiastes", "아가": "song", "로마서": "romans"}
BOOK = {v: k for k, v in SLUG.items()}
# bible-data.js 는 node 로 읽는다(window.BIBLE_TEXT = …)
js = "const w={};new Function('window',require('fs').readFileSync(process.argv[1],'utf8'))(w);const o={};for(const k in w.BIBLE_TEXT)if(%s.includes(k.split('/')[0]))o[k]=w.BIBLE_TEXT[k];process.stdout.write(JSON.stringify(o))" % json.dumps(list(SLUG), ensure_ascii=False)
BIBLE = json.loads(subprocess.run(["node", "-e", js, str(ROOT / "roadbible/bible-data.js")], capture_output=True, encoding="utf-8").stdout)
D = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"]
def sino(n):
    h, t, o = n // 100, n % 100 // 10, n % 10
    return (((D[h] if h > 1 else "") + "백") if h else "") + (((D[t] if t > 1 else "") + "십") if t else "") + D[o]
keep = lambda s: re.sub(r"[^0-9A-Za-z가-힣]", "", s)

model = WhisperModel("small", device="cpu", compute_type="int8", cpu_threads=8)
books = sys.argv[1:] or ["genesis", "exodus", "leviticus", "numbers", "deuteronomy", "romans", "song", "ecclesiastes"]
for slug in books:
    files = sorted(OUT.glob(f"{slug}-*.webm"), key=lambda p: int(p.stem.split("-")[-1]))
    for f in files:
        jf = f.with_suffix(".json")
        if jf.exists() != bool(CHECK): continue
        chap = int(f.stem.split("-")[-1]); book = BOOK[slug]; verses = BIBLE.get(f"{book}/{chap}") or []
        mt = f.stat().st_mtime; t0 = time.time()
        segs, _ = model.transcribe(np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], capture_output=True).stdout, dtype=np.float32), language="ko", word_timestamps=True, beam_size=1, vad_filter=False, condition_on_previous_text=False)
        hyp, ht = [], []                                   # 받아쓴 글자와 그 글자의 시각
        for s in segs:
            for w in s.words or []:
                c = keep(w.word)
                for i, ch in enumerate(c): hyp.append(ch); ht.append(w.start + (w.end - w.start) * i / len(c))
        if not hyp: print("받아쓰기 없음", f.name, flush=True); continue
        ref = keep(f"{book} {sino(chap)}{'편' if book == '시편' else '장'}"); starts = []
        for v in verses:
            starts.append(len(ref) if v else None); ref += keep(v.replace("⟪", "").replace("⟫", "")) if v else ""
        r2h = [None] * (len(ref) + 1)                      # 본문 글자 → 받아쓴 글자
        blocks = difflib.SequenceMatcher(None, ref, "".join(hyp), autojunk=False).get_matching_blocks()
        got = sum(b.size for b in blocks) / max(1, len(ref))
        for b in blocks:
            for i in range(b.size): r2h[b.a + i] = b.b + i
        out = []
        for st in starts:
            if st is None: out.append(None); continue
            j = next((k for k in range(st, min(len(ref), st + 12)) if r2h[k] is not None), None)   # 그 절 앞머리에서 맞은 첫 글자
            if j is not None: out.append(round(max(0.0, ht[r2h[j]] - (j - st) * 0.12), 2)); continue
            p = next((k for k in range(st, -1, -1) if r2h[k] is not None), None)                   # 못 찾으면 앞뒤 맞은 글자 사이를 글자 수로 나눔
            n = next((k for k in range(st, len(ref)) if r2h[k] is not None), None)
            if p is None or n is None: out.append(round(ht[r2h[n if p is None else p]], 2))
            else: out.append(round(ht[r2h[p]] + (ht[r2h[n]] - ht[r2h[p]]) * (st - p) / (n - p), 2))
        last = 0.0                                         # 뒤로 가는 시각이 없게
        for i, x in enumerate(out):
            if x is not None: out[i] = last = max(last, x)
        if CHECK:
            old = json.loads(jf.read_text(encoding='utf-8'))['v']; d = [abs(a - b) for a, b in zip(old, out) if a is not None and b is not None]
            print(f"{f.stem} 맞은 글자 {got:.0%} · 차이 평균 {sum(d) / len(d):.2f}초 최대 {max(d):.2f}초 · {time.time() - t0:.0f}초", flush=True); continue
        if jf.exists() or f.stat().st_mtime != mt: print("그 사이 새 음성이 옴, 건너뜀", f.name, flush=True); continue
        if got < 0.7: print(f"맞은 글자 {got:.0%} — 못 믿어서 안 씀", f.name, flush=True); continue
        jf.write_text(json.dumps({"id": "2", "v": out}), encoding="utf-8")
        print(f"{f.stem} 맞은 글자 {got:.0%} · {time.time() - t0:.0f}초", flush=True)
print("끝", flush=True)
