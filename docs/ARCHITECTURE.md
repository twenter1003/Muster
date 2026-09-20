# 지금 살아 있는 것

"이 코드가 실제로 쓰이나?"에 답하는 문서. 아래 표는 **추측이 아니라 호출부를 직접 훑어서**
만들었다(`apps/web/src`와 `scripts/`에서 경로 문자열 역추적, 스펙·목 서버 제외).

2026-09-20 정리에서 이 문서의 "호출된다" 표에 **틀린 행이 셋 있었다**. `burn-rate`·
`token-waste-intelligence`·`budget`을 화면이 부른다고 적어 두었으나, 실제로는 셋 다
클라이언트가 자체 계산하거나(`lib/burnRate.ts`·`lib/tokenIntelligence.ts`) `token-usage`
응답에 이미 들어 있었다. **컴포넌트가 그 이름의 데이터를 prop으로 받는 것**과 **그 이름의
엔드포인트를 부르는 것**을 혼동한 결과다. 다음에 이 표를 고칠 때도 `fetch`·`apiFetch`·
`useApi` 호출부까지 내려가서 확인할 것 — 컴포넌트 이름은 근거가 아니다.

> 이 문서를 고쳐야 하는 때: 라우트를 더하거나 뺄 때, 엔드포인트를 더하거나 뺄 때.
> 세션마다 갱신하는 문서가 아니다.

## 화면 — 5개

| 경로 | 파일 | 셸 |
|---|---|---|
| `/login` | `routes/LoginPage.tsx` | 밖 |
| `/invite/:token` | `routes/InvitePage.tsx` | 밖 |
| `/` · `/projects` | `routes/ProjectListPage.tsx` | 안 |
| `/projects/:id` | `routes/ProjectDetailPage.tsx` | 안 |
| `/import` | `routes/ImportReposPage.tsx` | 안 |
| `*` | `routes/pages.tsx` → `NotReadyPage` | 안 |

`apps/web/src/routes/`에 있는 파일은 **전부 위 목록에 해당한다.** 2026-09-20 이전에는
라우트 없는 화면 파일 11개가 같이 있었으나 PR #76에서 삭제했다(되살리려면 git 히스토리).

셸(`AppShell`)은 상단바 + 본문 2단이다. 사이드바는 없다 — `nav.ts`는 이제 상단바 경로
표기(breadcrumb)의 라벨 원천으로만 쓰인다.

## 백엔드 모듈 — 8개

`agent-registry` · `audit` · `auth` · `ingest` · `project-core` · `project-goals` ·
`realtime` · `search`

엔티티 22개, 마이그레이션 17개. **엔티티와 테이블은 모듈보다 많다** — 2026-09-20에
`env-catalog`·`inbox`·`reports` 모듈을 지우면서 코드만 지우고 테이블은 남겼기 때문이다
(되돌리기 비용이 마이그레이션까지 가면 급격히 커진다). `env_templates`·
`project_env_configs`·`env_config_transitions`·`policy_check_results`·`documents`는 지금 읽는 코드가
없는 테이블이다.

`audit`은 **쓰기 전용 모듈**이다. API 표면이 없고, 다섯 모듈이 `AuditService.record()`로
기록만 남긴다.

## 호출되는 엔드포인트

**화면이 부른다**

| 엔드포인트 | 호출부 |
|---|---|
| `GET /auth/me` · `POST /auth/logout` · `GET /auth/github/*` | `lib/session.tsx`, `shell/TopBar.tsx`, `LoginPage` |
| `GET /github/repos` · `POST /projects/import` | `ImportReposPage` |
| `GET /projects` · `GET/PATCH/DELETE /projects/:id` | `ProjectListPage`, `ProjectDetailPage` |
| `GET /projects/:id/commits` · `/logs` · `/deployment-events` · `/health-snapshots` | `ProjectDetailPage` |
| `GET/POST /projects/:id/git-integration` · `DELETE` | `lib/api.ts`, `ProjectDetailPage` |
| `GET/PATCH /projects/:id/goals` · `POST /goals/draft` | `ProjectDetailPage` |
| `GET/POST /projects/:id/api-keys` · `DELETE /api-keys/:id` | `ApiKeyModal` |
| `GET /projects/:id/token-usage` | `lib/agentFilter.ts` — 소모 속도(burn rate)도 이 응답에 실려 온다 |
| `GET /projects/:id/waste-report.csv` · `.json` | `lib/exportUtils.ts` |
| `SSE /projects/:id/stream` | `lib/useSse.ts` |
| `GET /search` | `shell/SearchBox.tsx` **하나뿐이다**. 프로젝트·에이전트 이름만 찾는다. 목록·가져오기·체크리스트 화면의 검색 입력은 서버에 안 가고 받아 둔 목록을 그 자리에서 거른다 |
| `POST /invites/lookup` · `POST /invites/accept` | `InvitePage` |

**스크립트·훅·외부가 부른다** (화면이 없어도 살아 있는 것)

| 엔드포인트 | 호출부 |
|---|---|
| `POST /agent-runs/by-repo` · `PATCH /agent-runs/:id` · `/heartbeat` | 훅 (`report-agent-usage.mjs` 양쪽) |
| `POST /agents/:id/runs` · `GET/POST /projects/:id/agents` | `muster-connect.mjs` |
| `GET /api-keys/verify` | `muster-connect.mjs` |
| `GET /connect.mjs` | `curl … \| node -` 연동 명령 |
| `POST /webhooks/github` | GitHub |
| `POST /projects/:id/logs` | 외부 로그 수집 |

**화면에서 부르지 않지만 남긴 것** (지우면 살아 있는 기능이 죽는다)

| 엔드포인트 | 남긴 이유 |
|---|---|
| `POST /projects/:id/invites` | 초대 토큰의 **유일한 생산자**. 살아 있는 `/invite/:token` 화면과 `POST /invites/lookup`·`accept`가 그 토큰을 소비한다. 발급 UI(SettingsPage)는 PR #76에서 지워졌지만 소비자는 살아 있다 |
| `DELETE /invites/:id` | 위 발급의 취소 경로. 이것까지 없으면 한 번 낸 초대를 영영 못 막는다 |
| `PUT /projects/:id/budget` | `project_budgets` 행을 만드는 **유일한 경로**. 지우면 `BudgetService.recalculateAndAlert`가 한도를 못 읽어 `budget_alert` SSE가 사실상 죽는다 |
| `POST /projects` | e2e가 쓴다. 화면에서 프로젝트를 만드는 길은 `POST /projects/import`뿐이다 |

## 2026-09-20에 지운 엔드포인트

PR #76이 화면 11개를 지우면서 소비자를 잃은 것들이다. 되살리려면 git 히스토리에 있다.

| 지운 것 | 딸려 나간 것 |
|---|---|
| `env-catalog` 모듈 전체 | 서비스·DTO 2,782줄. **테이블 4개는 남겼다** |
| `inbox` 모듈 전체 (`GET /inbox`) | 1,021줄 |
| `reports` 모듈 전체 (`GET /reports/summary`) | 978줄 |
| `GET /projects/:id/audit-logs` · `GET /audit-logs` | `AuditService`의 조회 메서드 둘. `record()`는 남았다 |
| 루트 `GET /logs` · `GET /health-snapshots` (cross-project) | `LogsService`·`HealthService`의 `listForMember`, `ingest/member-scope.ts` |
| `GET /projects/:id/stage-history` | `TimelineService.listStages`. `project_stage_history`에는 계속 쌓인다 |
| `POST /projects/:id/documents` · 루트 `GET /documents` · `GET/PATCH/DELETE /documents/:id` · `POST /documents/:id/complete` | `DocumentsController` 통째로, `DocumentsService`의 메서드 5개. **`GET /projects/:id/documents`는 남았다** |
| `GET /projects/:id/members` · `GET /projects/:id/invites` | `MembersService` 통째로, `InvitesService.listForProject` |
| `GET /agents` · `GET/PATCH/DELETE /agents/:id` · `GET /agents/:id/runs` · `GET /agent-runs/:id` | `AgentsService`의 메서드 3개, `AgentRunsService`의 둘, `UpdateAgentDto` |
| `GET /projects/:id/budget` | `BudgetService.get`은 private으로 남았다 (`put`이 쓴다) |
| `GET /projects/:id/burn-rate` | 없음 — `calculateBurnRate`는 `token-usage`가 계속 쓴다 |
| `GET /projects/:id/token-waste-intelligence` | `TokenWasteReportService.getTokenWasteIntelligence`. 순수함수 `computeTokenWasteIntelligence`는 `waste-report.json`이 쓴다 |

## 2026-09-20에 지운 것 — 문서 기능

PR #79가 업로드 경로를 지우면서 `DocumentsService.create`가 고아로 남았는데, 그것을 지우자
GCS 연동 전체가 따라 죽었다. 문서 기능을 접기로 하고 통째로 걷어냈다.

| 지운 것 | 비고 |
|---|---|
| `doc-store` 모듈 전체 | 컨트롤러·서비스·`ObjectStorage`·`GcsObjectStorage`·DTO |
| `GET /projects/:id/documents` | 프로젝트 상세 화면의 "문서" 패널도 같이 지웠다 |
| 검색의 `document` 종류 | `SearchKind`가 `project`·`agent` 둘로 줄었다. 검색 입력 안내문도 "프로젝트·에이전트 검색"으로 고쳤다 |
| `GCS_BUCKET`·`GCS_SIGNER_SERVICE_ACCOUNT` 환경변수 | `scripts/setup-gcs.sh`, 배포 스크립트·워크플로의 GCS 주입, DEPLOY.md 9단계 |

**`documents` 테이블과 `Document` 엔티티는 남겼다** — 기존 레코드는 그대로 있고 읽는 코드만
없다. GCS 버킷(`muster-docs-taewoo`)은 비어 있어서(객체 0개) 함께 삭제했다.
`GCP_PROJECT_ID`는 남는다 — Vertex AI(Gemini 폴백)와 Secret Manager가 쓴다.

## 알아 둘 구조적 제약

- **Cloud Run `max-instances=1` 고정.** SSE가 인프로세스 `EventEmitter2`를 구독하므로
  인스턴스가 둘이면 A가 받은 웹훅이 B에 붙은 클라이언트에 영영 안 간다. 풀려면 이벤트
  발행부를 Pub/Sub으로 바꿔야 한다.
- **`synchronize`는 어떤 환경에서도 켜지 않는다.** 스키마 변경은 전부 마이그레이션 파일로 남는다.
- **`webhook_deliveries` 테이블은 API 표면이 없다.** `webhook-ingest.service.ts`가 멱등성
  원장으로 직접 insert만 한다 — 죽은 테이블이 아니다.
