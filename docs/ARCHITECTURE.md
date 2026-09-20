# 지금 살아 있는 것

"이 코드가 실제로 쓰이나?"에 답하는 문서. 2026-09-20 전수 감사 결과이며, 아래 표는
**추측이 아니라 호출부를 직접 훑어서** 만들었다(`apps/web/src`와 `scripts/`에서 경로 문자열
역추적, 스펙 파일 제외).

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

## 백엔드 모듈 — 12개

`agent-registry` · `audit` · `auth` · `doc-store` · `env-catalog` · `inbox` · `ingest` ·
`project-core` · `project-goals` · `realtime` · `reports` · `search`

엔티티 22개, 마이그레이션 17개.

## 호출되는 엔드포인트

**화면이 부른다**

| 엔드포인트 | 호출부 |
|---|---|
| `GET /auth/me` · `POST /auth/logout` · `GET /auth/github/*` | `lib/session.tsx`, `shell/TopBar.tsx`, `LoginPage` |
| `GET /github/repos` · `POST /projects/import` | `ImportReposPage` |
| `GET /projects` · `GET/PATCH/DELETE /projects/:id` | `ProjectListPage`, `ProjectDetailPage` |
| `GET /projects/:id/commits` · `/logs` · `/deployment-events` · `/health-snapshots` | `ProjectDetailPage` |
| `GET /projects/:id/documents` (목록만) | `ProjectDetailPage` |
| `GET/POST /projects/:id/git-integration` · `DELETE` | `lib/api.ts`, `ProjectDetailPage` |
| `GET/PATCH /projects/:id/goals` · `POST /goals/draft` | `ProjectDetailPage` |
| `GET/POST /projects/:id/api-keys` · `DELETE /api-keys/:id` | `ApiKeyModal` |
| `GET /projects/:id/token-usage` | `lib/agentFilter.ts` |
| `GET /projects/:id/budget` | `ProjectDetailPage`, `lib/useSse.ts` |
| `GET /projects/:id/burn-rate` | `TokenStockChart` |
| `GET /projects/:id/token-waste-intelligence` | `TokenWasteIntelligenceCard` |
| `GET /projects/:id/waste-report.csv` · `.json` | `lib/exportUtils.ts` |
| `SSE /projects/:id/stream` | `lib/useSse.ts` |
| `GET /search` | `SearchBox`, `ProjectListPage`, `ImportReposPage`, `GoalChecklistDrawer` |
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

## 호출되지 않는 엔드포인트 — 다음 정리 대상

PR #76이 화면을 지우면서 소비자가 사라진 것들. **지우기 전에 위 두 표에 없는지 다시 확인할 것.**

| 대상 | 비고 |
|---|---|
| `env-catalog` 모듈 전체 (`/env-templates`, `/env-configs`, `/projects/:id/env-workflow`, approve·reject·execute·policy-checks·transitions) | 통째로 죽음. 엔티티·테이블까지 지우면 마이그레이션 필요 |
| `GET /inbox` | 유일한 소비자였던 사이드바 배지가 PR #76에서 삭제됨 |
| `GET /projects/:id/audit-logs` · `GET /audit-logs` | `AuditLogPage` 삭제됨 |
| `GET /reports/summary` | `ReportsPage`·`DashboardPage` 삭제됨 |
| `GET /projects/logs` · `GET /projects/health-snapshots` (cross-project) | 같음 |
| `GET /projects/:id/stage-history` | `ProjectOverviewPage` 삭제됨 |
| `POST /projects/:id/documents` · `POST /documents/:id/complete` · `PATCH`·`DELETE /documents/:id` | 업로드 UI 삭제됨. **목록 조회(`GET`)는 살아 있으니 남길 것** |
| `GET /projects/:id/members` · `POST/GET /projects/:id/invites` · `DELETE /invites/:id` | `SettingsPage` 삭제됨. **`lookup`·`accept`는 살아 있다** |
| `GET /agents` · `GET/PATCH/DELETE /agents/:id` · `GET /agents/:id/runs` | `AgentRegistryPage` 삭제됨. **`POST /agents/:id/runs`는 훅이 쓴다** |

## 알아 둘 구조적 제약

- **Cloud Run `max-instances=1` 고정.** SSE가 인프로세스 `EventEmitter2`를 구독하므로
  인스턴스가 둘이면 A가 받은 웹훅이 B에 붙은 클라이언트에 영영 안 간다. 풀려면 이벤트
  발행부를 Pub/Sub으로 바꿔야 한다.
- **`synchronize`는 어떤 환경에서도 켜지 않는다.** 스키마 변경은 전부 마이그레이션 파일로 남는다.
- **`webhook_deliveries` 테이블은 API 표면이 없다.** `webhook-ingest.service.ts`가 멱등성
  원장으로 직접 insert만 한다 — 죽은 테이블이 아니다.
