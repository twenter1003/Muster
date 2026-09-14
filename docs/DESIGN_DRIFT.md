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

## 8. LLM 호출 경로 — generateContent → Interactions API — Phase 5

4번에서 Gemini를 택할 때 전제한 호출 방식이 낡았다.

- **Interactions API**(`POST /v1beta/interactions`)가 2026-06 GA로 Gemini의 기본
  인터페이스가 되었고 `generateContent`는 레거시로 물러났다. 새 기능은 Interactions에만
  실린다.
- 키 형식도 바뀌었다. 표준 키(`AIza`)는 2026-09부로 폐지되고 auth key(`AQ.`)가 현행이다.

**채택**: Interactions API를 쓴다. 벤더 선택(4번)은 그대로다.

generateContent와 다른 점 — 옮길 때 걸린 것들:

| | generateContent | Interactions |
|---|---|---|
| 입력 | `contents: [{role, parts}]` | `input: {type: 'text', text}` |
| 시스템 지시 | `systemInstruction.parts` | `system_instruction` (문자열) |
| 구조화 출력 | `generationConfig.responseMimeType` | 루트 `response_format` — **스키마를 그대로** 받는다 |
| 응답 | `candidates[].content.parts[].text` | `steps[]` — `type: 'model_output'`인 단계의 `content[].text` |

응답 파싱에서 `steps`를 그냥 훑으면 안 된다. `thought` 같은 중간 단계가 섞여 있어
그것까지 파싱하려 들면 JSON이 아니라서 실패한다. `model_output`만 골라야 한다.

**폴백**: 키가 없으면 Vertex AI로 넘어간다. ADC로 인증하므로 키를 둘 수 없는 환경에서도
돈다. Vertex는 아직 3.x 모델이 안 나와(us-central1 기준 404) 기본 모델을 따로 둔다.

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

## 경미한 추가 (보고용)

| 컬럼 | 이유 |
|---|---|
| `SESSIONS.created_at` | 세션 목록·이상 로그인 추적 |
| `AGENTS.created_at` | 커서 페이지네이션 정렬 기준 |
