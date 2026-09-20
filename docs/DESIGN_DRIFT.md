# 설계서와 구현의 차이

`Muster_통합설계서_v2.1.md`가 요구사항의 원천이다. 다만 구현 세부에서 설계서를 그대로
따르는 것이 더 나쁜 결과를 내는 경우, **방향성을 해치지 않고 로직이 꼬이지 않는 선에서**
개선안을 택한다. 그렇게 갈라진 지점을 여기 전부 기록한다 — 기록하지 않으면 설계서가
더 이상 원천이 아니게 된다.

각 항목은 다음 중 하나다.
- **문서 누락** — 설계서에 없지만 설계서가 정의한 기능이 동작하려면 반드시 필요한 것
- **개선 채택** — 설계서에 있지만 더 나은 선택이 있어 다르게 간 것

## 지금도 유효한가 — 한눈에

항목 번호는 코드 주석에서 직접 참조되므로(예: "DESIGN_DRIFT 18번") **번호를 재사용하거나
당기지 않는다.** 되돌려진 결정도 지우지 않고 아래 표에 상태만 남긴다 — 문제는 기록이
남아 있는 것이 아니라, 되돌려진 결정이 *아직 유효한 것처럼* 읽히는 것이었다.

| # | 주제 | 상태 |
|---|---|---|
| 1–10 | Phase 3~7 스키마·인증·LLM 벤더·SSE 등 초기 결정 | 유효 |
| 11 | 프론트엔드 IA 경량화 — 레포 가져오기 중심 재편 | 유효 (PR #76이 여기서 라우트를 뺀 화면 파일까지 삭제해 마무리) |
| 12 | 목표 진행률 Gemini 자동 판정 | ❌ **되돌려짐 → 20번** |
| 13 | `PATCH /agent-runs/:id` API 키 인증 + 리포터 클라이언트 | 유효 |
| 14 | 멀티 모델 토큰 관제 + `npx muster-connect` | 유효 (21번에서 중복 정리) |
| 15 | 상세 화면 API 키 UI + Git 주소 자동 라우팅 | 유효 |
| 16 | `GET /projects?summary=true` + A/B 벤치마크 HUD | 부분 유효 — 요약 API는 살아 있고, **A/B HUD는 PR #73에서 제거됨** |
| 17 | 토큰 관제 6대 품질 개선 (PR #69) | 유효 |
| 18 | 토큰 4종 분리 — 비용 7.6배 과다 계상 정정 | 유효 |
| 19 | 낭비 판정·캐싱 ROI를 실측값으로 교체 | 유효 |
| 20 | 목표 진행률 AI 판정 제거 + 스키마 삭제 | 유효 (12번을 걷어낸 항목) |
| 21 | 토큰 리포팅 4중 중복 정리 + 훅 버전 배너 | 유효 |

---

## 1. `USERS.github_token_ref` (문서 누락) — Phase 3

설계서 Part 4 §3의 "웹훅 자동 등록"은 사용자의 GitHub 액세스 토큰이 필요한데,
ERD에 그 토큰을 보관할 자리가 없다. 토큰 원문은 Part 2 §6.2("DB에 평문 저장 금지")에 따라
시크릿 저장소에 두고, DB에는 참조만 남긴다. `GIT_INTEGRATIONS.webhook_secret_ref`와 같은 패턴이다.

## 2. `GIT_INTEGRATIONS.webhook_id` (문서 누락) — Phase 3

설계서 Part 4 §3의 "연동 해제"는 GitHub의 `DELETE /repos/{owner}/{repo}/hooks/{hook_id}`를
호출해야 하는데 hook id를 보관할 자리가 없다. 이 컬럼이 없으면 연동을 해제해도
GitHub에 웹훅이 그대로 남아 이벤트가 계속 배달된다.

## 3. `AUDIT_LOGS.action` — 열거형 CHECK 대신 형식 CHECK (개선 채택) — Phase 3

설계서 Part 3은 18개 닫힌 값 집합을 제시했으나, 그 목록에 **이미 구현된 엔드포인트의
액션이 빠져 있었다** — `git_integration.create`, `git_integration.delete`,
`document.update`, `env_config.execute`.

열거형을 DB에 박으면 Phase 7에서 감사 미들웨어를 붙이는 순간 레포 연동이 CHECK 위반으로
실패한다. 감사 로그 쓰기가 실패해서 본 작업까지 막히는 것은 감사 추적의 목적과 정반대다.

**채택**: 값 집합의 원천을 `entities/enums.ts`의 유니온 타입(컴파일 타임)으로 옮기고,
DB는 `<리소스>.<동작>` 형식만 강제한다. 오타는 컴파일 타임에 잡히고, 쓰레기 값은 DB가 막으며,
새 감사 대상이 생겨도 마이그레이션이 필요 없다. 누락됐던 4개를 채워 22개.

## 4. LLM 벤더 — Claude API → Gemini Developer API (개선 채택) — Phase 5

설계서 Part 1 §9는 "LLM(Claude API) 호출이 가능한 환경"을, Part 2 §6.2는 시크릿 목록에
"Claude API 키"를 적었다.

**채택**: Gemini Developer API. 플랫폼 전체가 이미 GCP 단일 벤더이고(설계서가 GCP를 고른
이유 자체가 비용 구조), LLM만 다른 벤더에 두면 계정·과금·인증이 하나 더 늘어난다.
방향성("LLM으로 도커 설정을 생성한다")은 그대로이고 벤더만 바뀐다.

생성 품질 리스크가 낮은 이유는 Policy Gate 때문이다 — 설계서 Part 1 §3.2.1의 전제가
"LLM 출력을 믿지 않는다"이므로, 생성이 나쁘면 정책 검사에서 걸리거나 재시도로 흡수된다.
Part 1 §10도 통과율/재시도율을 추적 지표로 잡아 두었다.

구현은 `DockerConfigGenerator` 인터페이스 뒤에 둔다(`GitHubOAuthClient`·`SecretStore`와 같은 패턴).
벤더를 다시 바꿔도 호출부는 그대로다.

- 키 발급: https://aistudio.google.com/apikey
- 환경변수: `GEMINI_API_KEY` (공식 SDK가 읽는 이름. `GOOGLE_API_KEY`도 인식하며 그쪽이 우선한다)
- 모델·단가·무료 티어 한도는 Phase 5 착수 시점에 공식 문서로 확인해 확정한다

## 5. `pending` 문서를 숨기지 않음 (개선 채택) — Phase 4 예정

설계서 Part 4 §4는 `GET /documents/:id`가 "`completed` 상태만 조회 결과에 포함"이라고 했다.
그러면 업로드에 실패한 문서를 사용자가 열 수도 지울 수도 없다 — 같은 절에 `DELETE`가 있는데
`GET`이 404를 내면 클라이언트는 "없는 문서"로 판단해 삭제를 시도할 이유가 없다.

**채택**: `pending`도 `upload_status`와 함께 반환하고, 목록에서 `?upload_status=`로 거를 수 있게 한다.
`DELETE`는 `pending`에서도 동작하며, GCS 객체가 없어도 실패로 보지 않는다(업로드가 시작조차
안 됐을 수 있고, "지우려는데 이미 없다"를 실패로 처리하면 레코드를 영영 못 지운다).
24시간 정리 배치는 사용자가 방치한 경우의 백스톱으로 남는다.

> **2026-09-20: 이 항목은 더 이상 코드에 없다.** 문서 기능을 접으면서 `doc-store` 모듈과
> GCS 연동을 통째로 지웠다(PR #83). 위 판단 자체가 틀렸던 것은 아니고, 그 기능을 쓰는
> 화면이 PR #76에서 사라진 뒤 되살리지 않기로 한 결과다. 기록은 남겨 둔다 — 문서 기능을
> 다시 만들 때 같은 함정을 다시 밟지 않기 위해서다.

---

## 6. `PUT /projects/:id/budget` — 전체 교체 의미 확정 (해석 확정) — Phase 4

설계서 Part 4 §6은 동사만 PUT으로 정하고 부분/전체 갱신 여부는 말하지 않았다.
동사에 맞춰 **전체 교체**로 구현했다 — 생략한 한도는 "안 건드림"이 아니라 "한도 없음"이다.
필드가 셋뿐이고 클라이언트가 전체를 아는 자원이라, 부분 갱신 규칙을 따로 외우게 하는 것보다
동사와 의미를 일치시키는 쪽이 낫다.

## 7. `POST /agents/:id/runs`의 인증 수단 신설 (문서 누락 보완) — Phase 4

설계서는 이 엔드포인트를 "`X-API-Key` 인증"이라고만 적었고, 그 키를 **검증하는** 경로는
어디에도 정의돼 있지 않았다. PROJECT_API_KEYS는 발급·조회·폐기만 있었다.
`ApiKeysService.resolveProject`와 `ApiKeyGuard`를 신설했다. 폐기된 키는 매칭되지 않으며,
없는 키와 폐기된 키의 응답을 동일하게 두었다 — 다르면 유효한 키를 탐색할 단서가 된다.

## 8. LLM 호출 경로 — "Interactions API" 전제를 되돌림 — Phase 5 정정 (project-goals 작업 중 발견)

이 절은 원래 "`generateContent`가 레거시로 물러나고 `POST /v1beta/interactions`가
Gemini의 기본 인터페이스가 됐다"고 적고 있었다. 근거를 다시 확인할 수 없는 서술이었고,
그 전제로 짠 `GeminiDockerConfigGenerator`(`env-catalog/gemini-docker-config.generator.ts`,
이제 삭제됨)는 실제로 존재하지 않는 엔드포인트·요청/응답 모양을 쓰고 있었다 —
`GEMINI_API_KEY`가 비어 있어 Vertex 경로로 우회되는 바람에 겉으로는 멀쩡해 보였을 뿐,
그 키를 넣는 순간 조용히 깨지는 잠재 버그였다.

목표/요구사항 기반 진행률 기능(아래 12번)에서 Gemini를 다시 조사하며(WebSearch로 교차
확인, 공식 문서 `ai.google.dev`는 이 프로젝트의 실행 환경 네트워크 정책상 직접 열람이
막혀 있어 검색 스니펫으로 대조) 바로잡았다: **`generateContent`가 여전히 실제
엔드포인트다.** `POST /v1beta/models/{model}:generateContent`, 인증은 `x-goog-api-key`
헤더, 구조화 출력은 `generationConfig.responseMimeType`+`responseSchema`. "표준 키(AIza)
폐지" 서술도 근거가 없어 함께 걷어냈다.

**정정**: 두 호출 경로(AI Studio API 키 / Vertex AI ADC) 모두 실제 `generateContent`
모양을 쓰는 공용 클라이언트(`common/llm/`, `GeminiClient` 인터페이스 + `HttpGeminiClient`/
`VertexGeminiClient`)로 합쳤다. 백엔드 선택(키 있으면 Http, 없고 GCP_PROJECT_ID 있으면
Vertex, 둘 다 없으면 503)은 `LlmModule` 한 곳에만 있다 — env-catalog(도커 설정 생성)와
project-goals(목표 초안·진행률 분석) 둘 다 이 모듈을 통해서만 Gemini를 만난다. 벤더
선택(4번) 자체는 그대로다.

**모델 이름에 대한 고지**: 이번 정정에서도 정확한 현재 모델 ID를 공식 문서로 직접
검증하지는 못했다. 기존에 Vertex 경로에서 실제로 쓰여 온 `gemini-2.5-flash`를 두 경로
공통 기본값으로 삼았다 — `GEMINI_MODEL`/`VERTEX_MODEL` 환경변수로 언제든 덮어쓸 수 있다.

---

## 9. GitHub 토큰 갱신 (문서 누락) — Phase 6

설계서는 GitHub 액세스 토큰의 **수명**을 다루지 않는다. 그런데 GitHub OAuth 앱은
"Expire user access tokens"가 기본으로 켜져 있고, 그러면 액세스 토큰이 8시간 뒤 죽는다.
기존 구현은 access_token만 보관해서, 로그인 몇 시간 뒤 레포 연동이 서버 로그의
경고 한 줄만 남기고 조용히 실패했다. 배포는 그 설정을 꺼 두는 것으로 우회하고 있었는데,
누가 앱을 새로 만들면(기본값 = 켜짐) 같은 증상이 그대로 돌아온다.

그래서 `refresh_token`·만료 시각까지 한 벌로 묶어 시크릿 저장소에 JSON으로 보관하고
(DB에는 여전히 참조만 남는다 — Part 2 §6.2), 토큰을 꺼내는 문을 `GitHubTokenService`
하나로 모아 만료됐으면 쓰기 직전에 갱신한다. 갱신도 불가능하면 `GITHUB_REAUTH_REQUIRED`를
던지고, 설정 화면의 Git 연동 탭이 "GitHub 재인증이 필요합니다"와 재로그인 링크를 띄운다.

- 새 에러 코드 `GITHUB_REAUTH_REQUIRED` (403). `FORBIDDEN`과 가른 이유: 사용자가 할 일이
  "권한을 받아라"가 아니라 "다시 로그인하라"라서, 화면이 줄 수 있는 행동이 다르다.
- 이전에 저장된 평문 토큰 형식도 계속 읽는다. 만료가 꺼진 앱에서 로그인한 사용자를
  이 변경만으로 강제 로그아웃시킬 이유가 없다.

---

## 10. SSE 이벤트 타입에 `budget_alert` 추가 (개선 채택) — Phase 7

설계서 Part 4 §7.3은 `GET /projects/:id/stream`의 이벤트 타입을 `log`·`health_update`·
`stage_change` 셋으로 못박았다. 그런데 Part 4 §6이 정의한 예산 임계치 알림
(`BUDGET_THRESHOLD_EXCEEDED`)에는 **구독자가 없었다** — 발행만 하고 아무도 받지 않는다.

**왜 인박스로 충분하지 않은가**: 인박스(`GET /inbox`)는 현재 상태에서 항목을 유도하므로
임계치를 넘은 프로젝트는 이미 목록에 뜬다. 다만 사람이 그 화면을 **열어야** 보인다.
반면 이벤트는 넘어서는 순간에만 발행된다(직전 미만 → 지금 이상). 프로젝트 화면을 띄워 둔
사람은 새로고침 전까지 한도 아래로 보이는 화면을 보고 있고, 그동안 실행은 계속 돈다.

**채택**: 넷째 타입 `budget_alert`로 스트림에 싣는다. 새 엔드포인트도, 알림 저장 테이블도,
메일·웹훅 같은 외부 채널도 만들지 않는다 — 이미 있는 연결에 타입 하나를 더하는 것이
가장 적은 추가로 "발행되는데 아무도 안 받는" 상태를 없앤다. §7.3이 "클라이언트는 필요한
이벤트 타입만 구독"이라고 했으므로 기존 클라이언트는 영향을 받지 않는다(하트비트 `ping`을
더할 때와 같은 근거다).

프로젝트 격리는 다른 셋과 같은 필터를 탄다. 예산 페이로드는 사용액과 한도가 들어 있어,
새면 남의 프로젝트 지출이 그대로 넘어간다 — 그래서 테스트를 따로 고정했다.

화면은 경보를 받으면 **예산 카드를 다시 부른다.** 경보 페이로드의 숫자로 화면을 고치지
않는 이유는, 그러면 화면이 두 개의 진실(조회 결과와 이벤트)을 갖게 되고 둘이 어긋날 때
어느 쪽이 맞는지 화면 안에서는 알 수 없기 때문이다.

**남는 것**: 알림은 화면을 띄워 둔 사람에게만 닿는다. 아무도 안 보고 있을 때의 경로
(메일·슬랙 등 프로세스 밖 채널)는 여전히 없다. 무료 티어 안에서 붙일 수 있는 채널을
정하는 것이 먼저라 여기서 결정하지 않았다.

> **2026-09-20: 되돌렸다 — 그리고 이 항목이 고치려던 문제가 그대로 재발했었다.**
>
> 위 "화면은 경보를 받으면 예산 카드를 다시 부른다"는 **끝내 구현되지 않았다.**
> `useSse.ts`는 `budget_alert`를 구독했지만 `ProjectDetailPage`의 핸들러에는 그 분기가
> 없었고, 이벤트는 배열에 쌓이기만 했다. 즉 "발행되는데 아무도 안 받는" 상태를 없애려고
> 더한 타입이, 한 칸 뒤로 밀린 채 **같은 상태로 돌아가 있었다** — 구독은 늘었는데 쓰는
> 곳이 없으니, 겉보기에만 소비자가 생긴 것이다.
>
> PR #87에서 체인 전체를 지웠다: 구독·SSE 매핑·도메인 이벤트·`BudgetService`·
> `PUT /projects/:id/budget`. `project_budgets` 테이블은 남겼다.
>
> 교훈은 이 항목의 원래 진단과 같다. **구독자를 더하는 것과 쓰는 것은 다르다.**
> 다시 붙인다면 받아서 화면이 무엇을 하는지부터 정하고, 그것을 테스트로 고정할 것.

---

## 11. 프론트엔드 IA 경량화 — 레포 가져오기 중심으로 재편 (개선 채택)

설계서 02장은 고정 사이드바(1a)에 프로젝트·DocStore·EnvCatalog·AgentRegistry·로그·헬스·
리포트·감사 로그·설정 9개 목적지를 건다. 실제로 써 보니 로그인 직후 사용자가 "뭐부터
해야 하나"를 못 찾는 문제가 있었다 — 진입 경로가 "빈 프로젝트를 이름으로 만들고 레포
연동은 설정에 숨어 있다"였고, 원래 의도("GitHub 레포를 가져오면 커밋·배포·에러·토큰
사용량을 한 곳에서 본다")와 화면이 어긋나 있었다.

**채택**: 핵심 루프만 남기고 나머지는 라우트에서 뺐다.

- 남긴 것: 로그인 → **레포 가져오기**(`/import`, 신규) → 프로젝트 목록(`/`) → 프로젝트
  상세(`/projects/:id`, 모니터링). 고정 사이드바를 없애고 상단바(브랜드=홈 링크 +
  "레포 더 가져오기")만 남겼다 — 목적지가 셋뿐이라 224px 사이드바를 띄워 둘 이유가 없다.
- 뺀 것(라우트만 — 파일은 지우지 않았다): DocStore·EnvCatalog·AgentRegistry·로그·헬스·
  리포트·감사 로그·알림(Inbox)·설정. `DashboardPage`·`ProjectOverviewPage`도 더 이상
  어떤 라우트도 가리키지 않지만 파일은 남아 있다 — 다시 필요해지면 라우트 한 줄만
  되살리면 된다.
- **레포 가져오기**(`POST /projects/import`)가 새 진입점이다. 레포마다 "프로젝트 생성 +
  Git 연동 + 웹훅 등록"을 한 번에 묶고, 레포 하나의 웹훅 등록 실패가 나머지를 막지 않는다
  (`{ items: [{ full_name, status, project_id?, error? }] }`로 부분 성공을 그대로 보고한다).
  레포 목록은 `GET /github/repos`(신규, `GitHubOAuthClient.listRepos`) — 이미 저장된
  OAuth 스코프에 `repo`가 있어 재로그인 없이 된다.
- 프로젝트 상세의 "커밋" 카드는 새 테이블을 만들지 않고 GitHub API를 그때그때 호출한다
  (`GitHubRepoClient.listCommits`, `GET /projects/:id/commits`). "빌드·테스트 워크플로"
  카드는 개별 테스트 통과/실패 개수가 아니라 CI 성공/실패만 보여준다 — 그 이상은 워크플로
  아티팩트에서 테스트 리포트를 파싱하는 별도 수집이 필요해 이번 범위에서는 뺐다(문서
  누락이 아니라 의도적 축소).
- "오늘/이번 달 토큰 사용량"은 `BudgetService.dailyUsage`(신규, `GET
  /projects/:id/token-usage`)가 낸다. 기존 `budget` 엔드포인트는 한도 대비 누적만 주고
  "오늘"을 못 물어서 나눴다.
- **연동 시 과거 워크플로 이력 백필** — 실제로 레포를 가져와 써 보니(사용자 확인), 웹훅은
  등록 이후의 이벤트만 받아서 막 가져온 프로젝트는 배포·워크플로·헬스 카드가 전부
  비어 보였다. `GitHubRepoClient.listWorkflowRuns`(`GET .../actions/runs?status=completed`)를
  추가해 `GitIntegrationService.connect()` 안에서 과거 실행을 DEPLOYMENT_EVENTS로 한 번
  적재한다 — 웹훅 인터프리터(`github-events.ts`)와 같은 success/failure 판정만 남긴다.
  헬스 스냅샷은 여기서 재계산하지 않는다(Ingest가 자기 트랜잭션 안에서만 재계산하는
  경계를 넘지 않으려는 것) — 다음 실제 웹훅이 오면 백필된 행까지 포함해 계산된다.
  배포(`deployment_status`) 이력은 백필하지 않는다 — GitHub Deployments API를 따로 쓰지
  않는 레포가 대부분이라 대체로 비어 있어, Actions 이력만으로 이득이 더 크다고 봤다.

새 마이그레이션은 없다 — `Project`·`GitIntegration`·`DeploymentEvent`·`HealthSnapshot`·
`LogEntry`·`Document`·`AgentRun` 기존 엔티티로 전부 충당된다.

---

## 12. 목표/요구사항 기반 진행률 — Gemini 연동 (개선 채택)

11번 재설계 이후에도 "GitHub Actions 탭이랑 다를 게 없다"는 피드백이 남았다 — 커밋·배포
카드는 전부 사실 나열이고, 해석(지금 얼마나 왔고 뭐가 남았나)이 없었다. GitHub이 못 하는
그 해석 영역을 Gemini로 채운다.

- **입력 경로 둘을 합쳤다.** 사용자가 목표를 직접 입력하는 경로와, 레포의 README/
  `docs/`를 Gemini가 읽어 초안을 만드는 경로(`POST /projects/:id/goals/draft`) —
  후자가 없으면 목표 입력 화면도 빈 칸으로 시작해 11번에서 고친 "뭐부터 해야 하나"
  문제가 되풀이된다. 초안은 **저장되지 않는다** — 그 자리에서 응답으로만 돌아가고,
  사용자가 검토·수정한 뒤 `PATCH /projects/:id/goals`로 확정해야 반영된다. 확정본
  하나만 진실로 두어, 서버가 미확정 버전을 따로 관리할 필요가 없게 했다.
- **문서 스캔 범위를 의도적으로 줄였다.** README + 루트 `docs/` 폴더의 `.md` 파일
  1단계만(재귀 없음), 파일 최대 20개·파일당 20KB·합계 60KB에서 자른다
  (`GitHubRepoClient.listDocs`) — 전체 레포를 훑으면 프롬프트 크기가 커밋마다 달라져
  예측할 수 없고, 대부분의 프로젝트 문서는 README와 `docs/` 최상위에 있다.
- **진행률 분석은 자동이 아니라 사용자가 누를 때만 돈다** (`POST
  /projects/:id/progress/analyze`). 웹훅마다 돌리면 Gemini 호출 비용이 커밋 빈도에
  묶이고, 진행률처럼 자주 안 바뀌는 값을 매 push마다 재계산할 이유가 없다.
  `ProjectProgressSnapshot`은 `HealthSnapshot`과 같은 insert-only 이력이라, 나중에
  추이를 보여주고 싶어지면 새 엔드포인트만 추가하면 된다.
- **Gemini의 구조화 출력(`responseSchema`)을 스키마 강제에 쓰되, 응답을 다시
  검증한다.** `env-catalog`의 `parseDockerConfig`와 같은 이유 — 스키마를 지키게
  요청해도 모델이 범위를 벗어난 값(예: percent 150)을 낼 수 있어, `percent`는
  0~100으로 자르고 `remaining_items`는 `title`이 빈 항목을 버린다.
- **기존 Gemini 연동의 잠재 버그를 이번에 같이 고쳤다.** 8번 참조 — env-catalog의
  Docker 설정 생성이 존재하지 않는 API 모양(`/v1beta/interactions`)을 쓰고 있었다.
  올바른 `generateContent` 클라이언트(`common/llm/`)를 공용으로 만들어 env-catalog와
  이 기능이 함께 쓰게 했다.
- **모델 이름 — 실배포에서 확인됨(2026-09-14).** 공식 문서를 직접 열람하지 못해
  `gemini-2.5-flash`를 잠정 기본값으로 두고 배포했는데, 실제 Cloud Run에서 첫 호출이
  404로 막혔다: `"This model models/gemini-2.5-flash is no longer available to new
  users. Please update your code to use models/gemini-3.6-flash"`(Gemini API 응답
  원문). `GEMINI_MODEL` 기본값을 `gemini-3.6-flash`로 바꿨다 — 이건 추측이 아니라
  API가 직접 알려준 값이다. `VERTEX_MODEL`은 같은 방식으로 확인하지 못해
  `gemini-2.5-flash`로 남겨 뒀다(Vertex 쪽에서 404가 나면 마찬가지로 바꿔야 한다).
  둘 다 환경변수로 배포 시점에 덮어쓸 수 있다.

새 테이블 둘: `PROJECT_GOALS`(프로젝트당 1행, 확정된 목표), `PROJECT_PROGRESS_SNAPSHOTS`
(insert-only 이력). `GEMINI_API_KEY`/`GCP_PROJECT_ID` 둘 다 없으면 이 기능도 env-catalog와
같은 방식으로 503을 낸다(`UnconfiguredGeminiClient`).

---

## 13. `PATCH /agent-runs/:id`도 API 키를 받는다 + 실제 리포터 클라이언트 신설 (개선 채택)

7번에서 `POST /agents/:id/runs`(실행 **시작**)에 API 키 인증을 열었지만, 실행 **종료**
(`PATCH /agent-runs/:id`)는 그때도 지금까지도 세션 인증뿐이었다 — 코드 주석은 "사람이
대시보드에서 정정할 수 있어야 하니 세션"이라고 근거를 달았지만, 그 결과로 **외부
에이전트는 실행을 시작할 수는 있어도 실제 토큰/비용을 채워 끝맺을 방법이 없었다**.
사람이 대시보드에서 매 실행을 일일이 정정하지 않는 한 "토큰 사용량" 카드는 영원히
0으로 남는 상태였다 — 자진신고 기능이 자진신고할 방법이 없었던 셈이다.

`AgentRunsController.finish`에 startRun과 같은 `ApiKeyOrSessionGuard`를 달고,
`AgentRunsService.finish`가 신원(세션 `userId` 또는 API 키 `apiKeyProjectId`)에 따라
접근 범위를 나눠 확인하도록 고쳤다(`RunIdentity` 판별 유니언). 시작 라우트가 이미
증명한 패턴 그대로라 새 위험은 없다 — 키는 자기 프로젝트로, 사람은 자기가 멤버인
프로젝트로만 좁힌다. e2e로 대칭성을 검증했다(`test/agent-runs-auth.e2e-spec.ts` —
남의 키·남의 세션으로는 끝맺지 못하는 것까지 확인).

**이걸로 끝나지 않는다 — API가 열려도 호출하는 쪽이 없으면 여전히 0이다.** 그래서
Claude Code를 첫 리포터 클라이언트로 붙였다(`scripts/claude-code-hooks/
report-agent-usage.mjs`, 설치는 `docs/AGENT_TOKEN_REPORTING.md`):

- **`SessionStart`에서 실행을 시작하고 `SessionEnd`에서 끝맺는다.** 둘 사이의 대응은
  `~/.muster/runs/<session_id>.json`에 `run_id`를 적어 뒀다가 읽는 식으로 잡는다 —
  Claude Code 훅은 상태를 유지하지 않는 단발 프로세스라, 시작과 끝을 잇는 저장소가
  스크립트 밖에 필요하다.
- **토큰 수는 transcript JSONL을 직접 합산해서 구한다** — Claude Code가 세션이 끝날 때
  집계된 총 사용량을 훅 payload로 주지 않는다. 실제 transcript 파일(`type: "assistant"`
  줄의 `message.usage`)을 열어 필드명을 확인한 뒤(2026-09-16) 작성했다 — 문서화되지
  않은 내부 포맷이라 Claude Code가 바꾸면 합산 로직도 깨질 수 있다는 점을 문서에
  명시해 뒀다.
- **비용은 기본적으로 비워 둔다.** 모델·플랜마다 단가가 달라 추측해서 채우면 목표/
  진행률 기능(12번)에서 지켰던 "근거 없는 숫자를 만들지 않는다" 원칙이 깨진다. 사용자가
  `MUSTER_COST_PER_MTOK_INPUT`/`_OUTPUT` 환경변수로 요율을 직접 주는 경우에만 계산한다.
- **설정 없는 레포에서는 조용히 아무 일도 안 한다.** 훅은 전역(`~/.claude/settings.json`)
  으로 걸릴 수 있으므로, Muster로 추적하지 않는 다른 프로젝트에서 매번 오류를 내면 훅
  자체를 못 쓰게 된다. `.muster/config.json`(레포 로컬, gitignore 대상) 또는 세 환경변수
  (`MUSTER_API_URL`/`MUSTER_API_KEY`/`MUSTER_AGENT_ID`)가 전부 없으면 `null`을 돌려주고
  끝낸다.
- **훅은 세션을 절대 막지 않는다.** 네트워크 오류든 설정 오류든 항상 `exit 0`으로
  끝나고 stderr에만 남긴다 — 이 리포터가 죽었다고 Claude Code 자체가 막히면 본말전도다.

로컬 API 서버를 띄우고 실제 프로젝트·에이전트·API 키를 만들어 `SessionStart`/
`SessionEnd` 훅 JSON을 스크립트에 직접 흘려보내는 방식으로 전체 흐름(시작 → transcript
합산 → 종료 → `/agents/:id/runs` 조회로 확인)을 검증했다 — 순수 함수 6개는
`node --test scripts/claude-code-hooks/report-agent-usage.test.mjs`로 별도 커버한다.

---

## 14. 멀티 모델(Claude Code / Antigravity) 토큰 관제 및 1줄 연동 CLI (`npx muster-connect`) 신설 (개선 채택)

13번에서는 Claude Code 토큰 수집만 지원했으나, 개발자가 여러 AI 에이전트(Claude Code, Google Antigravity 등)를 병행해서 사용하거나 특정 에이전트만 단독 사용하는 환경에서 도구별 토큰 소모량과 컨텍스트 낭비를 명확히 비교·관제할 수 없었다. 또한 외부 개발자 온보딩 시 수동으로 훅과 `.muster/config.json`을 작성해야 하는 마찰이 컸다.

**채택된 개선 사항**:

1. **1줄 연동 CLI 도구 (`npx muster-connect` / `scripts/muster-connect.mjs`)**:
   - Ponytail 원칙 준수: 외부 npm 의존성 전혀 없이 Node.js 20+ 내장 모듈(`node:readline`, `node:fs`, `node:path`, `node:sqlite`, `fetch`)만으로 구동.
   - 대화형 인터페이스 및 비대화형 플래그(`--yes`, `--url`, `--key`, `--project`, `--tools`) 지원.
   - 원클릭으로 Muster 에이전트 자동 생성, `.muster/config.json` 및 `.gitignore` 등록, Claude Code(`.claude/settings.json`) 및 Antigravity(`.agents/hooks.json`, `~/.gemini/config/hooks.json`) 훅 자동 등록, 과거 세션 스캔 및 원클릭 백필을 원스톱으로 처리.

2. **Google Antigravity 세션 토큰 실측 훅 (`scripts/antigravity-hooks/`)**:
   - Antigravity 세션 완료 이벤트(`Stop`)와 연동.
   - Antigravity 세션 SQLite DB(`~/.gemini/antigravity/conversations/<id>.db`)의 `steps` 테이블 `metadata` BLOB을 자체 순수 JS 경량 Protobuf 디코더로 해석하여 정확한 입력 토큰(Tag 9 sub[2])과 출력 토큰(Tag 9 sub[3])을 추출.
   - SQLite 파일이 없거나 잠겨있을 경우 `transcript.jsonl` 기반 문자 수 환산(4 chars/token)으로 안전하게 폴백.
   - 세션 안전성: 어떤 오류가 발생해도 `exit 0` 보장.

3. **백엔드 API 확장**:
   - `BudgetService.dailyUsage`: `agent_name` (`claude-code` | `antigravity` | `all`) 쿼리 파라미터를 지원하여 특정 도구별 토큰 소모량 및 컨텍스트 낭비율만 필터링 집계 가능.
   - `AgentRunsService.start`: `CreateRunDto`(`started_at`, `ended_at`, `tokens_used`, `cost`, `status`)를 허용하여 과거 세션 대량 백필 지원.

4. **웹 대시보드 UI 인터랙션 (`apps/web`)**:
   - `emil-design-eng` 및 `minimalist-ui` 철학에 맞춰 토큰 관제 카드 상단에 `[전체 보기]`, `[Claude Code]`, `[Antigravity]` 필터 칩 배치.
   - 100ms ease-out 전환과 zero layout shift를 보장하며, 최근 세션별 이력 카드에 도구 뱃지 표시.

---

## 15. 프로젝트 상세 화면 API 키 발급 UI 복원 및 Git 주소 기반 에이전트 토큰 자동 라우팅 (개선 채택)

11번(화면 통폐합)으로 `SettingsPage` 라우트가 제거된 후, 프로젝트 상세 화면(`ProjectOverviewPage`) 헤더에 `API 키 {개수}`라는 텍스트만 남고 실제 API 키를 발급/확인/복사할 수 있는 경로가 사라졌었다. 또한 레포지토리마다 매번 터미널을 열어 `npx muster-connect`를 수동 설정해야 해서 다중 레포를 다루는 사용자의 설정 비용이 컸다.

**채택된 개선 사항**:

1. **프로젝트 상세 화면 API 키 관리 모달 (`ApiKeyModal.tsx`) 신설**:
   - 상단 헤더 메타 링크 및 액션 버튼(`[API 키 관리]`), 에이전트 탭 헤더에 직관적인 모달 진입점 배치.
   - 1클릭 신규 API 키 발급, 1회성 원문 키 복사, 등록 키 목록 조회 및 폐기 기능.
   - **완성형 1줄 연동 명령어 복사 버튼**:
     - 🚀 전역 1회 자동 라우팅 연동 (가장 추천): `npx muster-connect --global --key=... --tools=both --yes`
     - 📁 현재 레포 전용 연동: `npx muster-connect --project=... --key=... --tools=both --yes`

2. **Git Remote URL 기반 에이전트 토큰 자동 라우팅 (`POST /api/v1/agent-runs/by-repo`)**:
   - 백엔드에서 `repo_url`과 `agent_name`, 토큰 사용량을 수신하면, API Key 소유자(`user_id`)가 관리하는 프로젝트 중 `GitIntegration.repo_url`이 일치하는 대상 프로젝트를 찾아 실행 이력을 자동 적재.
   - `normalizeGitRepoUrl`: HTTPS, SSH(`git@github.com:owner/repo.git`), git:// 등 다양한 형태의 git remote 주소를 우리 DB의 표준 `https://github.com/<owner>/<repo>`로 안정적으로 정규화.
   - 타겟 프로젝트에 해당 에이전트가 없으면 기본 설정으로 자동 생성하여 즉시 적재 지원.

3. **에이전트 훅 자동 라우팅 및 `muster-connect --global` 지원**:
   - 맥북 전역 `~/.muster/config.json` 1회 등록 지원 (`npx muster-connect --global`).
   - Antigravity 및 Claude Code 훅이 로컬 설정이 없는 레포에서도 `git remote get-url origin`을 자동 감지하여 Muster 프로젝트로 토큰 자동 리포팅 (Zero-config 관제 실현).

---

## 16. 프로젝트 목록 N+1 해소를 위한 통합 고속 요약 API (`GET /projects?summary=true`) 및 A/B 벤치마크, 로그인 성능 가속 (개선 채택)

기존 프로젝트 목록 화면(`ProjectListPage`)은 프로젝트 10개 기준 각 카드마다 헬스·배포·로그·토큰 사용량을 개별적으로 호출(1 + 10×4 = 41개 HTTP 요청)하는 심각한 N+1 네트워크 폭포(Waterfall) 병목과 슬롯 깜빡임(Layout Shifts) 문제가 있었다. 또한 로그인 OAuth 콜백 시 GCP Secret Manager 버전 폐기 및 DB 세션 발급이 직렬로 대기되어 로그인 응답이 지연되는 현상이 있었다.

**채택된 개선 사항**:

1. **백엔드 고속 일괄 요약 API (`GET /projects?summary=true`)**:
   - `summary=false`일 때는 가벼운 기존 목록(`ProjectView`)을 반환하여 완벽한 하위 호환성 보장.
   - `summary=true`일 때 사용자 소속 프로젝트들에 대해 `git_integrations`, `health_snapshots`, `deployment_events`, `log_entries`, `agent_runs`, `agents`를 병렬 최적화 쿼리(DISTINCT ON 및 SUM 집계)로 1회 왕복 취합.
   - HTTP 요청 수를 41개에서 1개로 97.6% 감축, 네트워크 페이로드 60.3% 절감, 응답 시간 66배 가속 달성.

2. **로그인 성능 가속 및 메모리 세션 캐시 (`SessionService`, `GcpSecretManagerStore`)**:
   - `SessionService.resolve(token)`에 60초 TTL 인메모리 캐시를 도입하여, 매 API 요청마다 발생하는 Postgres `sessions` 및 `users` DB 조인 부하를 제거 (0ms 단위 응답). 로그아웃(`revoke`) 시 즉시 무효화.
   - `AuthService.completeLogin`: Secret Manager 토큰 저장(`githubTokens.store`)과 DB 세션 발급(`sessions.issue`)을 `Promise.all`로 병렬 실행.
   - `GcpSecretManagerStore.destroyOlderVersions`: 이전 버전 폐기 요청을 `Promise.allSettled`로 병렬 처리하여 순차 대기 지연 원천 차단.
   - 프론트엔드 `LoginPage`: 이미 세션이 있는 경우 홈(`/`) 즉시 리다이렉트, 로그인 버튼 클릭 시 'GitHub으로 연결 중…' 스피너 즉각 피드백 제공.

3. **웹 대시보드 UX/UI 고도화 및 실시간 A/B 벤치마크 HUD (`BenchmarkHud`)**:
   - **A/B 테스트 HUD**: `Variant A (레거시 N+1 분할 로딩)` ↔ `Variant B (통합 고속 대시보드)` 간 원클릭 실시간 토글 지원, 네트워크 요청 수·로딩 지연(ms)·슬롯 깜빡임 횟수·속도 배율(Speedup Factor) 실시간 계측 표시 (모바일 캡슐 모드 지원).
   - **스마트 검색창 및 필터/정렬**: 프로젝트명·레포 URL 실시간 퍼지 검색, 상태 필터 칩(`[전체]`, `[작업 중]`, `[배포 성공]`, `[배포 실패]`), 정렬(최근 생성순, 최근 활동순, 토큰 사용순, 비용순, 헬스 스코어순).
   - **카드 퀵 액션**: GitHub 바로가기 링크, API 키 관리 모달 바로열기 버튼.
   - **프로젝트 상세 화면**: 원클릭 전체 동기화(Refresh) 버튼, 프로젝트 퀵 스위처 드롭다운, 활성 에이전트 실시간 경과 시간 타이머(카운트업) 탑재.

---

## 17. 토큰 관제 6대 핵심 품질 개선 (개선 채택) — PR #69

기존 토큰 관제 시스템에서 발견된 데이터 중복, 라우트 이동 시 상태 누수, 하드코딩 모델 추론, LLM 호출 간헐적 오류, 틱 역전, 목표 갱신 수동 의존성을 6대 핵심 영역에 걸쳐 전면 개선했다.

1. **`TokenStockChart` 하단 바 그래프의 구간 소모 비용(`cost`, $ USD) 전환**:
   - 상단 라인은 토큰 사용량 추이(`tokens`), 하단 볼륨 바는 해당 구간 비용(`cost`)을 기준으로 독립 스케일링(`maxCost` 기반, 최소 2px 높이 가드). 주식 차트(가격 라인 + 거래대금 바)의 시각적 패턴을 차용해 토큰량과 실제 과금 비용의 괴리를 직관적으로 비교.
   - 범례 우측 `선: 토큰 추이 · 막대: 구간 비용 ($)` 안내 힌트 뱃지 추가.
   - 플로팅 툴팁 내 `전체 토큰`과 `구간 비용`을 독립 행으로 분리 표기.

2. **프로젝트 라우트 전환 시 라이브 틱 잔여 데이터 격리 플러시**:
   - `ProjectDetailPage.tsx`에서 URL `id` 변경 시 `liveTick`, `burnRate`, `activeLiveRun`, `agentHeartbeats`를 즉시 초기화.
   - `useSse.ts` 훅에서 `projectId` 변경 시 이전 SSE 이벤트 버퍼를 즉각 비우고(`setEvents([])`), unmount 시 연결 클린업 보장.

3. **실측 트랜스크립트 모델명 바인딩 및 DB 스키마 마이그레이션**:
   - `agent_runs` 테이블에 `model` nullable 컬럼 추가 (`1788910000000-AddAgentRunModel.ts`).
   - Claude Code 훅(`report-agent-usage.mjs`): assistant 메시지 내 `model` 필드 실측 파싱.
   - Antigravity 훅(`report-agent-usage.mjs`): `Model Selection` 로그 문자열 파싱 및 표준 모델명 정규화.
   - `muster-connect.mjs` 내장 훅 Base64 동기화.
   - `budget.service.ts`: `GROUP BY COALESCE(r.model, a.name)`으로 실측 모델별 토큰 및 비용 정확히 집계.

4. **Gemini LLM 장애 복원력 (지수 백오프 + 지터 + 타임아웃)**:
   - `apps/api/src/common/llm/retry.ts`: 3회 재시도, 지수 백오프(1s, 2s, 4s) + Jitter, 30초 타임아웃 AbortSignal 적용.
   - 429(Rate Limit), 500, 502, 503, 504 및 네트워크 단절 시 자동 재시도, 400/401/403/404 클라이언트 에러는 즉시 실패 처리.
   - `HttpGeminiClient` 및 `VertexGeminiClient` 공통 투명 연동.

5. **라이브 틱 단조 증가 보정 & `burnRate` 안정화**:
   - `Math.max`를 적용하여 네트워크 지연이나 SSE 재전송에 의한 토큰·비용 카운트 역전 차단.
   - `burnRate.ts`에서 음수 차분 0 클램핑 및 비정상 스파이크 방지.

6. **GitHub push 수신 시 목표 진행률 자동 갱신 훅 & 10분 쿨다운**:
   - `WebhookIngestService`에서 push 웹훅 수신 시 `DomainEvent.CODE_PUSHED` 비동기 발행.
   - `ProjectGoalsService`에서 `@OnEvent(DomainEvent.CODE_PUSHED, { async: true })`로 목표 달성도 자동 재분석 트리거.
   - 인메모리 맵 기반 **10분 쿨다운 가드**를 적용하여 불필요한 LLM 비용 폭증 방지.
   - Ingest ↔ ProjectGoals 간 직접 참조 없이 도메인 이벤트로 디커플링 유지 (`module-boundary.spec.ts` 100% 준수).

---

## 18. 토큰을 합계 하나로 저장하던 것을 4종으로 나눔 (정정) — 비용이 7.6배 부풀려지고 있었다

설계서와 어긋난 것이 아니라 **우리 문서대로 하지 않고 있던 것**을 바로잡은 항목이다.
`docs/LLM_ECOSYSTEM_GUIDE.md` 5장은 이미 "토큰 집계 시 `input_tokens`, `output_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens` 4개 필드를 모두 수집하여 캐싱 절감
효과를 구분 파악할 것"이라고 적고 있었다. 그런데 구현은 훅에서 네 값을 더해 `tokens_used`
하나로 만들어 보냈고, 서버는 그 합계를 **정규 입력가로** 곱했다.

**무엇이 틀어졌나**: 캐시 읽기 단가는 정규 입력가의 10% 안팎이고(가이드 2장) 캐시 쓰기는 오히려
25% 비싸다. 합쳐서 정규가로 곱하면 캐싱이 잘 들을수록 표시 비용이 실제와 벌어진다.

**실측**: 이 기기의 Claude Code 세션 12개(4,254 메시지)를 집계하니 입력 토큰의 **98.6%가
캐시 읽기**였고, 같은 데이터로 계산한 비용이 **$2,777 대 $364.94 — 7.6배** 차이였다.

곁가지로 세 가지가 함께 어긋나 있었다.

1. **낭비 판정이 거꾸로였다.** `token-waste.ts`는 세션 토큰이 5천만/1천만을 넘으면 60%/25%를
   낭비로 본다. 그런데 토큰이 큰 이유가 대개 캐시 읽기가 쌓여서다 — 즉 캐싱이 가장 잘 작동한
   세션이 가장 낭비가 심하다고 찍힌다. 실제 세션 12개 중 5개가 HIGH_WASTE로 분류됐다.
2. **캐싱 ROI가 상수에서 나왔다.** 중복 읽기를 `총토큰 × 0.15`로 고정하고 적중률을 낭비율에서
   역산한 뒤, 그 둘을 섞은 식으로 "$6.23 절감(42%)"처럼 측정값의 정밀도로 표시했다.
   정확히 계산할 실제 데이터(캐시 읽기 토큰)를 이미 읽고 있으면서 버리고 추정한 셈이다.
3. **자기모순**이었다. 화면은 "프롬프트 캐싱을 쓰라"고 권하는데, 그 조언을 따를수록 표시 비용은
   실제와 더 벌어지고 낭비 판정은 더 나빠졌다.

**채택**:

- `AGENT_RUNS`에 `input_tokens`·`output_tokens`·`cache_read_tokens`·`cache_write_tokens` 추가
  (마이그레이션 `1788920000000-AddAgentRunTokenBreakdown`). **nullable**로 둔다 — 예전 행은
  내역을 알 수 없고, 0으로 채우면 "캐시를 안 썼다"는 거짓이 되어 집계가 그 0을 사실로 취급한다.
- `tokens_used`의 의미는 그대로 둔다(네 종류의 합). 화면의 "토큰" 숫자가 이 값을 쓰기 때문이다.
- 단가표(`model-pricing.service.ts`)에 `cacheReadPerMillion`/`cacheWritePerMillion` 추가.
  **가이드 2장 단가표에 실린 모델만** 채우고, 없는 모델(DeepSeek 등)은 비워 둔 채 정규 입력가로
  센다 — 근거 없는 할인율을 지어내 싸게 보이게 하느니 비싸게 잡는 쪽이 낫다.
- 훅(`claude-code-hooks`)이 네 값을 나눠 보내고, `estimateCost`도 캐시 요율을 받는다.
  내역 없이 합계만 오는 옛 요청도 종전과 같은 값으로 계산한다(하위 호환).
- Antigravity 훅은 protobuf에 캐시 구분이 없어 내역을 보내지 않는다. 서버는 그때 종전처럼
  합계로 계산한다.

**남는 것**: 낭비 판정과 캐싱 ROI는 아직 옛 상수 기반이다. 이제 진짜 캐시 수치가 들어오므로
"추정"이 아니라 **측정된 반사실**(캐시 읽기 토큰 × 단가차)로 바꿀 수 있다. 벤치마크한 제품들
(Helicone·OpenRouter·Braintrust) 중 "낭비 토큰"이라는 숫자를 주장하는 곳은 하나도 없었고,
전부 적중률·절감액 같은 측정값이나 중앙값 대비 p99 분포로 표현한다. 다음 과제로 남긴다.

**재발 방지**: `npx muster-connect`가 훅을 base64로 품고 있어 손으로 동기화해 왔고, 실제로 이번에
어긋나 있었다. `scripts/sync-embedded-hooks.mjs`를 두어 갱신·검증(`--check`)을 자동화했다.

---

## 19. 낭비 판정(임계값)·캐싱 ROI(상수)를 실측값으로 교체 (정정) — 18번의 남은 과제 처리

18번에서 진짜 캐시 수치가 들어오기 시작했지만, 그 위의 판단 로직(`token-waste.ts`)은 여전히
상수였다. 이번 정정으로 그 판단을 실측값으로 바꿨다.

**무엇이 틀어졌나**: `assessSessionWaste()`는 세션 토큰이 5천만/1천만을 넘으면 60%/25%를 낭비로
판정했다. 토큰이 큰 이유가 대개 캐시 읽기가 쌓여서인데 — 실제 세션 12개 중 5개가 HIGH_WASTE로
분류됐다(캐싱이 가장 잘 든 세션이 가장 낭비가 심하다고 찍힘). 캐싱 ROI도 중복 읽기를
`총토큰 × 0.15`로 고정하고 적중률을 낭비율에서 역산한 뒤, "$6.23 절감(42%)"처럼 측정값의
정밀도로 표시했다 — 정확히 계산할 실제 데이터(캐시 읽기 토큰, 18번에서 이미 확보)를 두고
추정한 셈이다.

**벤치마크 조사**: Helicone·OpenRouter·Braintrust 중 "낭비 토큰"이라는 숫자를 주장하는 곳은
하나도 없었다. 전부 적중률·절감액 같은 실측 반사실이나 중앙값 대비 p99 분포로 표현한다.

**채택**:
- `computeCacheEfficiency()`: 적중률 = `cache_read / (input + cache_write + cache_read)`,
  절감액 = `cache_read_tokens × (모델별 정규 입력가 − 캐시 읽기가)`. 내역 없는(예전) 실행은
  **0이 아니라 집계에서 제외** — "모름"과 "캐시 안 씀"을 구분한다.
- `computeCostDistribution()`: 세션당 비용의 중앙값·p99와, 중앙값의 2배 이상이면서 상위 1%에
  드는 이상치 목록. 임계값으로 "낭비"를 선언하는 대신 분포만 보여준다.
- `assessSessionWaste`/`computeWasteInsight`/구 `computeTokenWasteIntelligence`(임계값·상수
  기반)는 삭제했다. 정적인 캐싱 실천 가이드와 모델별 캐시 단가 벤치마크는 프로젝트별 "판정"이
  아니라 공통 참고 정보라 유지했다.
- `ModelPricingService.resolvePricingRates()`를 추가해 `token-waste.ts`의 순수 함수 계층이
  모델별 단가(캐시 읽기가가 모델마다 다르다 — Fable 97.5% 할인, 나머지 90% 등)를 주입받는다.

**영향 범위**: 백엔드 3곳(`usage-timeseries.service.ts`, `token-waste-report.service.ts`,
`agent-runs.service.ts`)과 프론트 3곳(`TokenWasteIntelligenceCard.tsx`, `SessionWasteModal.tsx`,
`ProjectDetailPage.tsx`), `mock-server.mjs`. API 응답의 `waste_insight` 필드와 `SessionRunView`/
`SessionRunDetailView`의 `waste` 필드(레벨 기반)가 사라지고 `cache`(적중률/절감액 기반)로
바뀌었다 — 이 API를 직접 소비하는 외부 클라이언트가 있다면 갱신이 필요하다.

---

## 20. 목표 진행률 "AI 자동 판정" 제거 + `PROJECT_PROGRESS_SNAPSHOTS` 스키마 삭제 (되돌림) — 12번을 걷어냄

12번에서 채택한 "커밋↔체크리스트를 Gemini로 매칭해 자동으로 체크박스를 켜는" 기능
(`analyzeProgress`)을 PR #73에서 완전히 제거했다. 수동으로 체크박스를 누르는 대안
(`toggleGoalChecklist`)이 이미 완전한 형태로 존재해서 UI 동작은 100% 동일한데, Gemini 응답을
기다리는 지연·비용·오판정 위험만 얹혀 있었다 — 자기 값을 못 하는 기능이었다. 진행률 퍼센트
자체는 이 기능과 무관하게 이미 체크리스트 항목 수로 결정론적으로 계산되고 있었다
(`getGoalsProgressStats`) — AI가 하던 일은 퍼센트 계산이 아니라 "체크박스 대신 켜주기"뿐.

목표를 직접 입력하거나 레포 문서에서 초안을 만드는 경로(`draftGoals`, 12번 참조)는 이 기능과
무관해 그대로 유지했다.

**후속 스키마 정리 (PR #74)**: `analyzeProgress` 제거로 `ProjectProgressSnapshot` 엔티티가
죽은 코드가 됐다(create/save/findOne 호출부 전무, grep으로 확인). `1788930000000-
DropProjectProgressSnapshots` 마이그레이션으로 테이블을 드롭했다. `down()`은 12번 원본
마이그레이션(`1788900000000-AddProjectGoals`)의 CREATE TABLE·FK·인덱스·CHECK 제약을 그대로
복원한다. 테이블 드롭 전에 Cloud Run이 여전히 `analyzeProgress`가 살아있는 구버전을 서빙
중이면 드롭 직후 그 구버전이 없는 테이블에 쓰기를 시도해 장애가 나므로, PR #73 배포를 먼저
끝내고 나서 마이그레이션을 프로덕션에 적용했다.

---

## 21. 토큰 리포팅 로직 4중 중복 정리 + 훅 버전 배너 (정정 + 문서 누락) — PR #75

**무엇이 틀어졌나**: 토큰 사용량을 세는 로직(transcript 파싱)이 서로 독립적으로 4곳에
있었다 — 실시간 훅(`report-agent-usage.mjs`, 정확함), `muster-connect.mjs`의 base64
임베딩 사본(수동 동기화 스크립트로만 맞춰짐), 과거 세션 백필 파서(`scanClaudeSessions`
등, 토큰 4종 분리·모델명 없이 합계만 내던 옛 버전), 그리고 `apps/web/public/connect.mjs`
(캐시 토큰 분리 이전 버전이 통째로 박제된 완전히 죽은 네 번째 사본, `GET
/api/v1/connect.mjs` 서빙의 폴백 경로 8개 중 하나로 남아 있었다). 그 결과 프로젝트를
새로 가져올 때 백필되는 과거 세션은 모델명이 항상 "모름", 캐시 적중률 집계에서 조용히
제외됐다 — 실시간 경로가 이미 정확한데 백필 경로만 안 따라간 것.

**채택**: 죽은 사본(`apps/web/public/connect.mjs`, `scripts/backfill-claude-tokens.mjs`)
삭제, 백필 파서가 실시간 훅과 같은 함수(`sumUsageFromTranscript`, `sumUsageFromStepsDb`)를
재사용하도록 교체, CI에 임베딩 동기화 확인(`sync-embedded-hooks.mjs --check`) 추가.

**문서 누락 — 훅 버전 리포팅**: 훅 코드를 고쳐도 이미 설치된 머신은 재설치 전까지
갱신되지 않는다는 구조적 결함이 실제 사고(이 컴퓨터 훅이 218줄 뒤처져 model·토큰 필드를
아예 안 보내던 것)로 드러났다. 훅이 `hook_version`을 같이 보고하고(`AGENT_RUNS.hook_version`,
마이그레이션 17번), 서버가 최신 버전보다 낮은 걸 감지하면 프로젝트 상세 화면에 "이 머신
훅이 오래됨" 배너를 띄운다. 자동 갱신(훅이 스스로 최신 코드를 받아 덮어쓰는 방식)은
매 실행 네트워크 호출과 자가 수정 위험이 개인용 서비스 규모에 안 맞아 기각했다 — 배너로
"모르고 방치"만 막는다.

**보안 사고**: `scripts/backfill-claude-tokens.mjs`(삭제됨)에 프로덕션 Supabase DB
비밀번호가 평문으로 커밋돼 있었다(GitHub 퍼블릭 저장소). 사용자가 Supabase 콘솔에서
즉시 로테이션했고, 새 비밀번호로 `migration:show` 연결을 확인한 뒤 마이그레이션·배포를
진행했다.

---

## 경미한 추가 (보고용)

| 컬럼 | 이유 |
|---|---|
| `SESSIONS.created_at` | 세션 목록·이상 로그인 추적 |
| `AGENTS.created_at` | 커서 페이지네이션 정렬 기준 |
| `AGENT_RUNS.model` | 실측 모델명(Claude 3.5 Sonnet, Gemini 3.8 Flash 등) 영속화 |
| `AGENT_RUNS.input/output/cache_read/cache_write_tokens` | 캐시 단가를 반영한 정확한 비용 산출 (18번) |
| `AGENT_RUNS.hook_version` | 훅이 낡았는지 판별해 배너를 띄우기 위함 (21번) |
