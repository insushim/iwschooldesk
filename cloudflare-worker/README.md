# SchoolDesk 급식 프록시 Worker

NEIS 급식 API를 Cloudflare Workers로 프록시 + 캐싱. 같은 학교 사용자들이 한 번 받은 데이터를 공유해 NEIS 호출량을 학교당 1일 1회로 줄입니다.

## 배포 (5분, 한 번만)

### 1. Cloudflare 계정 + wrangler

```bash
# Cloudflare 가입: https://dash.cloudflare.com/sign-up (무료)

cd cloudflare-worker
npm install
npx wrangler login   # 브라우저에서 로그인 승인
```

### 2. KV 네임스페이스 생성

```bash
npx wrangler kv:namespace create CACHE
```

출력의 `id = "..."` 를 복사해서 `wrangler.toml` 의 `REPLACE_WITH_KV_ID` 를 교체.

### 3. NEIS 인증키 등록 (선택, 권장)

```bash
npx wrangler secret put NEIS_API_KEY
```

키 값 붙여넣고 엔터. 인증키 발급은 https://open.neis.go.kr 에서.
인증키 없이도 동작하지만, 운영 인증키 있으면 일일 100만건까지 안정적.

### 4. 배포

```bash
npx wrangler deploy
```

배포 끝나면 URL 출력됨 (예: `https://schooldesk-meal.your-name.workers.dev`).

### 5. SchoolDesk 에 URL 박기

`school-desk/electron/main.ts` 의 `MEAL_WORKER_URL` 상수를 위 URL로 교체.

또는 빌드 시 환경변수로:
```
MEAL_WORKER_URL=https://schooldesk-meal.your-name.workers.dev npm run build:win
```

## 비용

- **무료 티어**: 일일 10만 요청, KV 일일 10만 read / 1천 write
- 한국 학교 1.2만개, 학교당 1일 1회 캐시 미스 = 1.2만 write/일 → 충분히 여유
- 사용자 10만명 × 1일 1회 호출 = 10만 read/일 → 무료 한도

## 엔드포인트

- `GET /school?name=한가람초` — 학교 검색 (캐시 7일)
- `GET /meal?scCode=B10&schoolCode=7010001&date=2026-04-27` — 오늘의 급식 (캐시 25시간)
- `GET /health` — 헬스체크

## 캐시 정책

| 종류 | TTL | 이유 |
|---|---|---|
| 학교 검색 | 7일 | 학교 정보 거의 안 바뀜 |
| 급식 | 25시간 | 자정 이후 새로 fetch |

Worker 자체도 Cloudflare 엣지 캐시 60초 — 같은 요청이 동시에 폭주해도 1번만 NEIS 닿음.
