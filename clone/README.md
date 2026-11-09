# clone — 내 목소리 읽어주기

글을 넣으면 **운영자 본인의 목소리로 학습한 모델**이 읽어 고른 음량의 음성 파일(WAV)로 만들어 주는 개인용 TTS 화면.

## 구조 (글자당 요금 없음)
- **Cloudflare Worker `clone`**(이 폴더): 로그인 화면 · 대본 입력 · 대기열(D1 `clone`) · 결과 저장(R2 `clone-audio`) · 재생 · 내려받기. 무거운 계산은 하지 않는다.
- **PC 처리기**(리포 밖 `D:\ws\clone\agent\agent.py`): 몇 초마다 `/api/agent/claim` 으로 대기 작업을 가져가 GPT-SoVITS(내 목소리 모델, GTX 1070)로 문장별 생성 → 음량 균일화(-16 LUFS · LRA ≤ 5 · TP -1.5) → `/api/agent/jobs/:id/result` 로 WAV 올림. PC 가 꺼져 있으면 켜질 때 처리.
- 음성 · 학습 자료 · 모델은 **공개 리포에 올리지 않는다**(모두 `D:\ws\clone`).

## 비밀값 (`node deploy.mjs --wrangler secret put <이름> --name clone`)
- `CLONE_PASS` 화면 로그인 비밀번호
- `AGENT_TOKEN` PC 처리기 인증 토큰(처리기 설정 파일과 같은 값)

## 배포
```
node deploy.mjs clone
node deploy.mjs --wrangler d1 execute clone --remote --file clone/_worker/schema.sql -y   # 처음 한 번
```
자체 Worker 라 xim · xms 에는 연결되지 않는다.
