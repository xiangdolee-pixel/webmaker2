# domains — 도메인 연결 도구

**xim 메뉴 "도메인 연결"** (https://xim.plators.com/domains — xim 운영자 로그인 그대로). 따로 열 때는 https://domains.plators.com (Worker `domains`, 비밀번호 = 비밀값 DOMAINS_PASS).
xim 은 `/api/dm/*` 를 서비스 바인딩 `DOMAINS` 로 넘긴다(xim 비밀값 DOMAINS_TOKEN = domains 비밀값 AGENT_TOKEN).

**새 도메인을 붙일 때:** 평소처럼 Cloudflare 에서 그 Worker 에 도메인을 붙여(Custom Domain) 사이트가 열리는 걸 본 뒤, xim "도메인 연결" 에서 도메인 · Worker 고르고 연결하기. Cloudflare 에 있는 도메인은 TXT 로 호스트 확인이 안 돼서(회색 CNAME 을 걸어야 확인됨) 인증서가 Active 되면 바로 주소를 바꾼다 — 그 순간 1분 안쪽으로 끊긴다(나사렛장학회.kr 때 약 50초 522).

## 왜

KT 는 Cloudflare **무료** 존의 IP 대역을 LA 로 돌려 보내서, 평소엔 괜찮다가 수시로 크게 느려진다(첫 응답 2초 넘게 튐).
**유료(Pro)** 존의 IP 대역은 시애틀로 가고 늘 고르다. 그래서 plators.com 하나만 Pro 로 올리고, 다른 도메인은
Cloudflare for SaaS(사용자 지정 호스트)로 plators.com 의 IP 를 빌려 탄다. 회사 webchon.co.kr · 6988.co.kr 과 같은 방식.

- `*.plators.com` 은 이 도구가 필요 없다 — plators.com 존이 Pro 면 그대로 유료 IP.
- 원본은 IP 가 아니라 **Worker 경로**: plators.com 존에 `<도메인>/*` → 고른 Worker.
- 입구 `sites.plators.com`(AAAA `100::`, 주황) = Fallback Origin. 다른 도메인은 여기에 **회색 CNAME**.

## 한 도메인의 단계

1. 화면에서 도메인 · Worker 고르고 "연결하기" → 사용자 지정 호스트 등록(www 함께) + Worker 경로
2. 인증서 · 소유 확인 TXT → 인증서 Active
3. (끊김 없게 그 뒤에) 그 도메인 DNS 를 회색 CNAME → sites.plators.com 으로, 예전 Workers Custom Domain 떼기
4. 넣었던 TXT 지우기

그 도메인이 xiangdolee 계정 Cloudflare 에 있으면 2~4 를 자동으로(화면이 열려 있는 동안 15초마다), 다른 곳(가비아 등)이면
넣을 값을 화면에 보여 준다. "예전 방식으로 되돌리기" = 회색 CNAME 떼고 Workers Custom Domain 으로 다시 붙이기.

## 설정

- 비밀번호: Worker 비밀값 `DOMAINS_PASS` (리포에 없음)
- Cloudflare API 토큰: 화면에서 처음 한 번 붙여 넣음 → KV `domains`(키 `token`). 권한 = 계정 Workers 스크립트 편집,
  영역 · DNS 편집 · SSL 및 인증서 편집 · Workers 경로 편집 · 영역 읽기 (모든 영역)
- KV `txt:<호스트>` = 자동으로 넣은 TXT 레코드 id(다 되면 지움)
