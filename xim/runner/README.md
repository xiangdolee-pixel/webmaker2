# xim 스튜디오 PC 도우미 — 다른 PC 에 세팅하기

PC 도우미는 xim 스튜디오의 일감을 가져가 **글은 Claude Code(구독)** 로, **그림(슬라이드 · 썸네일)은 ChatGPT(Plus, 브라우저 자동화)** 로 만들어 xim 에 올린다. 추가 요금 없음. 어느 PC 에서든 아래대로 하면 된다.

## 1. 필요한 것

| 항목 | 설치 |
|---|---|
| Node 20+ | https://nodejs.org |
| Python 3.10+ | https://python.org (설치 때 "Add to PATH" 체크) → `pip install -r D:\ws\docs\tools\requirements.txt` |
| Claude Code | `npm install -g @anthropic-ai/claude-code` → 터미널에서 `claude` 실행해 구독 계정으로 로그인 |
| 엣지(또는 Brave) | 보통 이미 있음 |
| 저장소 | `D:\ws\webmaker2` (공개) 하나 — 비공개 작업(`docs\tools\` 엔진 · clone · Claude 메모리)은 그 안 `_pc` 서브모듈에 있고, 옛 경로 `D:\ws\docs` · `D:\ws\clone` 은 정션(숨김)으로 연결된다(2026-11-10 개편, `setup-pc.ps1 -Setup` 이 만든다) |

## 2. 설정 (한 번)

xim → 스튜디오 → **설정** → "다른 PC 설치" 에 있는 명령을 그대로 복사해 실행한다. 모양은 이렇다.

```
node D:\ws\webmaker2\xim\runner\runner.mjs --setup --token <토큰>
```

점검 결과가 ✅/❌ 로 나온다. ❌ 가 있으면 옆의 안내대로 고치고 다시 실행한다. 통과하면 `D:\ws\docs\tools\_xim_helper.json` 이 만들어진다(토큰이 들어 있으니 리포에 올리지 않는다 — .gitignore 에 있음).

다른 폴더를 쓰면 `--docs <docs 폴더>`, Brave 를 쓰려면 `--browser brave`.

## 3. ChatGPT 로그인 (한 번)

```
node D:\ws\webmaker2\xim\runner\runner.mjs --login
```

자동화 전용 프로필로 브라우저 창이 뜬다. chatgpt.com 에 로그인한 뒤 창을 닫는다. 이 프로필은 내가 쓰는 브라우저와 별개라 평소 사용에 영향이 없고, 작업 중에는 화면 밖에서 돈다. 로그인은 보통 몇 달 유지된다. 풀리면 작업이 "ChatGPT 로그인 필요" 로 멈추니 다시 실행한다.

## 4. 도우미 켜기

```
D:\ws\docs\tools\스튜디오도우미_시작.bat
```

(또는 `node D:\ws\webmaker2\xim\runner\runner.mjs --mode pc`). 창을 켜 두면 xim 에서 시작한 작업을 5초 안에 가져가 처리한다. 창을 닫으면 멈추고, 작업은 xim 에 "대기" 로 남았다가 다시 켜면 이어진다.

## 그 밖에

- 인물 사진 분류표 다시 만들기: `--catalog` (xim 의 사진이 바뀌었을 때만)
- 작업 폴더: `D:\ws\docs\xim\<작업id>\` — 01/02/03 txt · shot2\1~6.png · 06_thumbnail.png · 04_slideshow.html (예전 result 폴더와 같은 구성)
- 설정 파일: `D:\ws\docs\tools\_xim_helper.json` `{ url, token, browser, docs }`

## 다른 PC 에서 코드 작업까지 이어가기

도우미만이 아니라 **Claude Code 작업 자체를 다른 PC 에서 이어가는** 순서는 xim → 왼쪽 메뉴 **"다른 PC"** 화면에 복사용 명령과 함께 있다. 스크립트는 `xim/runner/setup-pc.ps1`:

- `-Setup` 새 PC 세팅(webmaker2 + 비공개 `_pc` 서브모듈 받기 · 옛 경로 정션 · Claude 메모리를 `_pc/_claude/memory` 에 정션으로 연결 · 점검)
- `-Sync` PC 를 옮기기 전 · 뒤에 메모리 · clone 코드 커밋 + 푸시, 두 저장소 pull
- `-Startup helper|voice` 로그인할 때 자동 시작 등록
- 인자 없음: 점검만

내 목소리 처리기(GPU PC)는 `_pc` 서브모듈의 `clone/setup_pc.ps1`.
