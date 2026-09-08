# Phase 5 완료 / Phase 6 착수 지점 (2026-09-09)

## Phase 5 — EnvCatalog: 완료

설계서 Part 4 §5의 11개 엔드포인트. **실제 LLM과 실제 검사 도구로 전 구간 검증했다.**

| 흐름 | 확인한 것 |
|---|---|
| 생성 | 201, Gemini Interactions API로 Dockerfile/compose 생성 |
| Policy Gate 자동 실행 | Trivy·Conftest 각각 결과 기록, AND 판정 |
| 승인 | `policy_passed`에서만 200, 그 외 409 |
| 실행 | `approved`에서만 202 → `running` |

Policy Gate가 **실제 LLM 출력에서 진짜 위험을 잡았다**:
- Postgres 5432를 호스트에 노출 → Conftest가 차단
- 컨테이너를 root로 실행 → Trivy가 차단
- 막힌 구성은 사람이 승인하려 해도 409 (Part 1 §3.2.1 "승인 여부와 무관하게 원천 차단")

검사 도구는 API 이미지에 넣었다 — Trivy 0.74.0, Conftest 0.69.0. 호스트 설치 불필요.
커스텀 규칙은 `apps/api/policies/docker.rego` (마운트돼 있어 재빌드 없이 고칠 수 있다).

## 이번 페이즈에서 크게 데인 것: 낡은 지식

두 번 연속 기억으로 짰다가 틀렸다. **새 기술을 쓸 때는 웹으로 현행을 먼저 확인할 것.**

1. **Trivy 버전** — 0.58.1로 고정했으나 실제 최신은 0.74.0. 도커 빌드가 실패했다.
2. **Gemini API** — `generateContent`로 짰으나 2026-06부터 **Interactions API**가 기본이고
   generateContent는 레거시다. 키 형식도 `AIza`(2026-09 폐지) → `AQ.`로 바뀌었다.

두 API의 차이는 [DESIGN_DRIFT.md](DESIGN_DRIFT.md) 8번에 표로 정리했다. 특히 응답의
`steps` 배열에 `thought` 같은 중간 단계가 섞여 있어 `model_output`만 골라야 한다.

> 사용자가 "AQ.가 맞는 것 같은데"라고 지적했을 때 내가 기억을 재주장한 것이 시간을 크게
> 잃은 지점이다. 이견이 나오면 확인 신호로 받아들일 것.

## LLM 경로 구성

```
GEMINI_API_KEY 있음 → Gemini API (Interactions)   ← 현재 경로, 검증됨
GEMINI_API_KEY 없음 → Vertex AI (ADC 폴백)         ← 검증됨
둘 다 없음          → 503 (다른 기능은 정상 동작)
```

키는 `AQ.`로 시작하고 50자 남짓이다. 100자가 넘으면 키가 아닌 다른 값이다
(그 경우 모든 호출이 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED`).

---

## Phase 6 — Ingest / Realtime: 착수 직전

설계서 Part 4 §7. 아직 **코드를 한 줄도 쓰지 않았다.**

### 범위

**7.1 웹훅 수신** — `POST /webhooks/github`
- HMAC 서명 검증 (`X-Hub-Signature-256`, Part 2 §6.3)
- 멱등성: `X-GitHub-Delivery` 기준 중복 무시 — `webhook_deliveries.delivery_id` UNIQUE가
  집행 지점이다 (엔티티 주석 참조, 이미 존재)

**7.2 조회 API**
- `POST /projects/:id/logs` — 에이전트가 호출, `X-API-Key` 인증
- `GET /projects/:id/logs` — 레벨 필터
- `GET /projects/:id/deployment-events`
- `GET /projects/:id/health-snapshots`
- `GET /projects/:id/stage-history`

**7.3 SSE** — `GET /projects/:id/stream`, 이벤트 타입 `log` / `health_update` / `stage_change`

### 착수 전에 풀어야 할 설계 문제 (미결)

**Ingest는 `project-core`를 import할 수 없다.** 설계서 Part 2 §8의 결합 규칙이고,
`.eslintrc.js`의 no-restricted-imports와 `ingest/module-boundary.spec.ts`가 강제한다.

그런데 §7.2의 로그 API는 두 가지가 필요하다:
- `X-API-Key` 인증 → `ApiKeyGuard`가 지금 `agent-registry`에 있고 `project-core`의
  `ApiKeysService`에 의존한다
- 프로젝트 멤버십 검사 → `ProjectMemberGuard`가 `project-core`에 있다

**제안(미승인)**: 두 가드를 `common/auth/`로 옮기고 저장소(Repository)를 직접 쓰게 한다.
가드는 횡단 관심사이지 특정 모듈의 소유물이 아니고, §8의 의도(Ingest가 다른 모듈의
**서비스를 호출**하지 않는다)를 어기지 않는다. 옮기면 `doc-store`·`env-catalog`·
`agent-registry`의 import도 함께 정리된다.

이 이동은 기존 4개 모듈을 건드리므로 착수 전에 승인을 받는 것이 좋다.

### 없는 것 — 새로 만들어야 함

**`DEPLOYMENT_EVENTS` 엔티티가 없다.** 설계서 Part 3(240행)에 신설로 명시돼 있고
`GET /projects/:id/deployment-events`도 있는데 엔티티·마이그레이션이 둘 다 없다.
DORA 4지표의 입력 데이터가 여기서 나오므로 헬스 스코어보다 먼저 만들어야 한다.

`HEALTH_SNAPSHOTS`는 엔티티가 이미 있다. 산출식은 Part 2 §6.4 참조 —
데이터가 부족한 지표는 제외하고 남은 지표만 평균한다(그래서 개별 점수가 nullable).

### 주의

인프로세스 EventEmitter2는 인스턴스 간 전달이 안 된다. **Cloud Run은
`max-instances=1` 고정** (Phase 1 결정, README 참조). SSE가 여기에 걸려 있다.

`BUDGET_THRESHOLD_EXCEEDED` 이벤트는 Phase 4에서 발행만 해두고 구독자가 없다.
Realtime이 구독할 자리다.

---

## 환경 상태 (2026-09-09 기준)

- 테스트 **121개 통과**
- 컨테이너 기동 시 마이그레이션 자동 실행 (개발만; 프로덕션은 Phase 7에서 별도 설계)
- `apps/api/.secrets`는 호스트 마운트라 재빌드에도 살아남는다
- GCS·GitHub OAuth·웹훅·Gemini 전부 실동작 검증 완료 ([DESKTOP_SETUP.md](DESKTOP_SETUP.md))
- 남은 준비물: Phase 7의 Cloud Run·Cloud SQL·Secret Manager뿐
