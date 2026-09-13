# 화면 훑기 (smoke)

실제 브라우저로 앱을 눌러 보는 검사. `scripts/smoke-ui.mjs`.

## 왜 있나

타입·린트·단위 테스트는 **"코드가 컴파일된다"**까지만 말한다. 실제로 막혔던 것들은 그 아래에
있었다:

- 에이전트 등록 UI가 **아예 없었다** (서버 엔드포인트만 있고 부르는 화면이 없었다)
- 환경 구성 만들기 화면에 **들어가는 링크가 없었다** (주소를 직접 쳐야 들어갔다)
- 워크플로 파일을 사용자가 **손으로 복사**해야 했다
- 생성한 Dockerfile을 정작 **쓰지 않았다**

전부 화면을 한 번만 열어 봤으면 나왔을 것들이고, 전부 배포한 뒤에 발견됐다. 이 검사는 그
간극을 메운다.

## 무엇을 잡고 무엇을 못 잡나

**잡는 것** — 화면이 뜨는가, 버튼이 있는가, 눌러서 서버까지 갔다가 화면에 반영되는가,
콘솔 오류나 4xx/5xx가 나는가.

**못 잡는 것** — 진짜 GitHub·GCP가 있어야 드러나는 것. 알고 써야 한다:

| 실제로 겪은 실패                            | 여기서 잡히나                                     |
| ------------------------------------------- | ------------------------------------------------- |
| OAuth 스코프 부족 (`repo`·`workflow`)       | ✗                                                 |
| Cloud Run 서비스 계정의 Secret Manager 권한 | ✗                                                 |
| GitHub이 `204` 대신 `200`을 준 것           | ✗ — 스텁을 **추측으로** 짜면 테스트도 같이 틀린다 |
| 빈 레포에서 오는 `409`                      | ✗                                                 |
| 위의 UI 공백 넷                             | ✓                                                 |

## 돌리는 법

```bash
# 1. Postgres
DATABASE_URL=postgresql://muster:muster@localhost:5432/muster pnpm --filter @muster/api migration:run

# 2. API (8080) · 웹 (5173)
cd apps/api && DATABASE_URL=... npx ts-node -r tsconfig-paths/register src/main.ts &
cd apps/web && API_ORIGIN=http://localhost:8080 npx vite --port 5173 --host 127.0.0.1 &

# 3. 세션 발급 → 훑기
TOKEN=$(cd apps/api && DATABASE_URL=... npx ts-node -r tsconfig-paths/register scripts/dev-session.ts)
node scripts/smoke-ui.mjs "$TOKEN"
```

실패가 하나라도 있으면 종료 코드 1. 스크린샷은 `/tmp/muster-smoke`(`SMOKE_SHOTS`로 바꾼다).

## 알아 둘 것 둘

**`networkidle`을 쓰지 않는다.** 프로젝트 화면은 SSE 연결을 열어 둬서 네트워크가 영영
조용해지지 않는다. 기다리면 무조건 타임아웃이므로 `domcontentloaded`로 받는다.

**세션은 우회해서 만든다.** GitHub OAuth를 자동으로 통과할 방법이 없어
`apps/api/scripts/dev-session.ts`가 사용자와 세션을 직접 만든다. 실제 로그인 경로는
`oauth.e2e-spec.ts`가 검증하므로 여기서 흉내 낼 이유가 없다. 그 스크립트는
`NODE_ENV=production`이면 거부한다 — 인증을 우회하는 도구다.

## CI에 넣지 않은 이유

지금은 손으로 돌린다. CI에 넣으려면 러너에서 API·웹을 띄우고 Playwright 브라우저를 받아야
하는데(잡 시간이 몇 분 늘어난다), 그 값이 있는지 먼저 이 검사를 몇 번 써 보고 판단한다.
넣기로 하면 `ci.yml`에 잡을 하나 더 두면 된다 — 스크립트는 종료 코드로 이미 답한다.
