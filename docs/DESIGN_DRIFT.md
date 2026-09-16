# 설계서와 구현의 차이

`Muster_통합설계서_v2.1.md`가 요구사항의 원천이다. 다만 구현 세부에서 설계서를 그대로
따르는 것이 더 나쁜 결과를 내는 경우, **방향성을 해치지 않고 로직이 꼬이지 않는 선에서**
개선안을 택한다. 그렇게 갈라진 지점을 여기 전부 기록한다 — 기록하지 않으면 설계서가
더 이상 원천이 아니게 된다.

각 항목은 다음 중 하나다.
- **문서 누락** — 설계서에 없지만 설계서가 정의한 기능이 동작하려면 반드시 필요한 것
- **개선 채택** — 설계서에 있지만 더 나은 선택이 있어 다르게 간 것

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

## 경미한 추가 (보고용)

| 컬럼 | 이유 |
|---|---|
| `SESSIONS.created_at` | 세션 목록·이상 로그인 추적 |
| `AGENTS.created_at` | 커서 페이지네이션 정렬 기준 |
