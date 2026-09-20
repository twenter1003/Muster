# 돌리고 검증하는 법

## 로컬 실행

```bash
pnpm install
docker compose up -d --build     # api(:8080) + postgres(:5432)
curl http://localhost:8080/api/v1/health
```

`apps/api/src`는 볼륨 마운트라 컨테이너 재빌드 없이 핫리로드된다. 개발용 컨테이너는
**기동 전에 마이그레이션을 자동으로 돌리고**, 실패하면 서버도 안 뜬다 — 반쯤 맞는 스키마
위에서 도는 것보다 낫다. 프로덕션은 일부러 그렇게 하지 않는다(배포와 스키마 변경을 한
명령에 묶으면 롤백이 어려워진다).

컨테이너 없이:

```bash
pnpm dev:api    # :8080
pnpm dev:web    # :5173 (/api → :8080 프록시)
```

## 테스트

```bash
pnpm -r test                          # 단위 — API(jest) + Web(vitest)
pnpm --filter @muster/api test:e2e    # e2e — 로컬 Postgres 필요
pnpm --filter @muster/api test:cov    # 커버리지
pnpm lint
```

훅 테스트는 pnpm 워크스페이스 **밖**이라 `pnpm -r test`에 안 잡힌다. 따로 돌린다:

```bash
node --test scripts/claude-code-hooks/report-agent-usage.test.mjs \
            scripts/antigravity-hooks/report-agent-usage.test.mjs \
            scripts/muster-connect.test.mjs
```

현재 통과 숫자는 [STATE.md](STATE.md)에 있다.

### 훅을 고쳤다면

`muster-connect.mjs`가 훅 두 개를 base64로 품고 있어(의존성 없이 한 파일로 배포되어야 해서)
사본을 같이 갱신해야 한다. 잊으면 새로 연동하는 사용자에게 낡은 훅이 나간다.

```bash
node scripts/sync-embedded-hooks.mjs          # 갱신
node scripts/sync-embedded-hooks.mjs --check  # 확인만 (CI가 이걸로 막는다)
```

## 마이그레이션

```bash
docker compose up -d db
cd apps/api
pnpm migration:run      # 적용
pnpm migration:show     # 적용 현황
pnpm migration:revert   # 마지막 1개 되돌리기
pnpm migration:generate src/database/migrations/<이름>
```

생성된 SQL은 항상 사람이 검토한다. 프로덕션 적용은 [DEPLOY.md](DEPLOY.md) 참조.

## 화면을 눈으로 확인하는 법

프로덕션은 GitHub OAuth 뒤에 있어 UI를 그냥 열어 볼 수 없다. 목 서버를 쓴다:

```bash
pnpm --filter @muster/web build && node scripts/mock-server.mjs   # → localhost:4173
```

`.claude/launch.json`에 `mock`으로 등록돼 있다. 실기기 확인은 iOS 시뮬레이터 Safari로
`http://localhost:4173`을 연다 — 크롬 에뮬레이션으로는 안 잡히는 것들이 있다(입력 확대,
터치 표적 크기 등 실제로 이렇게 발견된 버그가 여럿 있다).

프론트엔드를 고쳤으면 **스크린샷으로 확인한 뒤** 끝낸다. 타입체크·테스트는 "컴파일된다"
까지만 말한다.

## ⚠️ `scripts/smoke-ui.mjs`는 현재 깨져 있다

Playwright로 실제 화면을 눌러 보는 검사인데, 훑는 경로 10개 중 **8개가 PR #76에서 지운
화면**이다(`/inbox`, `/docstore`, `/envcatalog`, `/reports`, `/audit`, `/settings/*`).
고치려면 살아 있는 5개 경로([ARCHITECTURE.md](ARCHITECTURE.md))만 남기면 된다 — 아직 안 했다.

이 검사가 있었던 이유는 남겨 둘 만하다. 실제로 이런 것들을 잡았다:

- 에이전트 등록 UI가 **아예 없었다**(서버 엔드포인트만 있고 부르는 화면이 없었다)
- 환경 구성 만들기 화면에 **들어가는 링크가 없었다**
- 생성한 Dockerfile을 정작 **쓰지 않았다**

전부 화면을 한 번만 열어 봤으면 나왔을 것이고, 전부 배포 후에 발견됐다.

못 잡는 것도 분명하다 — OAuth 스코프 부족, Cloud Run 서비스 계정의 Secret Manager 권한,
GitHub이 `204` 대신 `200`을 주는 것, 빈 레포의 `409`. 진짜 GitHub·GCP가 있어야 드러나는
것들이다.

두 가지 함정이 있다: **`networkidle`을 쓰지 않는다**(프로젝트 화면이 SSE를 열어 둬서 네트워크가
영영 조용해지지 않는다 — `domcontentloaded`로 받는다). **세션은 우회해서 만든다**
(`apps/api/scripts/dev-session.ts`가 사용자·세션을 직접 만든다. `NODE_ENV=production`이면
거부한다 — 인증을 우회하는 도구다).
