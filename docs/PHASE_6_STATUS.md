# Phase 6 완료 / Phase 7 착수 지점 (2026-09-12)

## Phase 6 — Ingest / Realtime: 완료

설계서 Part 4 §7의 7개 엔드포인트. **실제 컨테이너에 요청을 보내 전 구간 확인했다.**

| 엔드포인트 | 확인한 것 |
|---|---|
| `POST /webhooks/github` | 서명 유효 200, 무효·누락 401 |
| `POST /projects/:id/logs` | X-API-Key 201, 무키 401, 잘못된 레벨 400 |
| `GET /projects/:id/logs` | 레벨 필터 + 커서 페이지네이션 |
| `GET .../deployment-events` | 200 |
| `GET .../health-snapshots` | DORA 4지표 + composite |
| `GET .../stage-history` | 200 |
| `GET .../stream` | log / stage_change / health_update 실시간 수신 |

검증: tsc exit 0, 테스트 **187개 통과**(121 → +66), lint는 착수 전과 같은 14건(전부 기존 것).

### 세 구간으로 나눠 진행했다

1. 가드 이동(`2b6ba9d`) → 2. 웹훅 + DEPLOYMENT_EVENTS(`b146301`)
→ 3. 조회 API + DORA(`79ca9a2`) → 4. SSE(`fd24189`)

## 착수 전 미결이던 것 — 해결

**가드를 `common/auth/`로 옮겼다** (승인받음). Ingest는 Part 2 §8 때문에
`project-core`를 import할 수 없는데 §7.2의 로그 API에는 `ApiKeyGuard`와
`ProjectMemberGuard`가 둘 다 필요했다.

서비스 의존을 Repository 직접 주입으로 바꾸고 `CommonModule`(@Global)이 제공하게 했다.
부수 효과로 `doc-store`·`env-catalog`·`agent-registry`의 `ProjectCoreModule` import가
전부 불필요해졌다. `hashToken`도 `common/auth/token-hash.ts`로 내렸다 — 그러지 않으면
`common/auth`가 `modules/auth`를 import해서 Ingest가 가드를 통해 모듈에 닿는다.

**`DEPLOYMENT_EVENTS`를 신설했다.** 마이그레이션 `1788860000000`.
`committed_at`은 nullable이다 — `deployment_status` 페이로드에 커밋 시각이 없어서
NOT NULL이면 없는 값을 지어내야 하고 그 순간 리드타임 중앙값이 거짓이 된다.

**`PROJECT_STAGE_HISTORY`는 이미 있었다.** 착수 시점에 "아무도 안 쓴다"고 적었는데
틀렸다 — `ProjectsService.create`/`update`가 `current_stage`와 같은 트랜잭션에서
쓰고 있었다. 그래서 Ingest는 읽기만 하고, 이벤트로 넘겨 쓰는 구조로 바꾸지 않았다.
발행이 실패하면 타임라인에 구멍이 나는데 그건 이력 테이블이 존재하는 이유와 어긋난다.

## 설계서에 없어서 여기서 정한 것

**DORA 관측 창 = 90일.** §6.4가 등급 구간("주 1회 이상")만 정하고 어느 기간을 보는지
정하지 않았다. 가장 느슨한 구간이 "분기 1회"라 그보다 짧으면 Medium과 Low를 구분할 수
없고, 길면 반년 전에 멈춘 프로젝트가 지금도 Elite로 보인다.

**성공 0건은 Low(1), 이벤트 0건은 null.** 아직 배포한 적 없는 프로젝트와 한 번도
성공하지 못한 프로젝트가 같은 점수를 받으면 안 된다.

**미복구 실패는 MTTR에서 제외.** "지금까지 걸린 시간"은 장애가 길어질수록 자라서
과거 스냅샷과 비교가 되지 않는다.

**SSE 하트비트 25초, `ping` 타입.** Cloud Run·프록시가 유휴 연결을 끊는다. SSE 주석
(`: keepalive`)이 더 가볍지만 Nest의 `@Sse()`는 MessageEvent만 직렬화한다.

산출값은 손으로 검산했다. 이벤트 3건(성공 9/10, 실패 9/11 09:30, 성공 9/12 04:05)에서
빈도 2 / 리드타임 4 / 실패율 2 / MTTR 3 → composite 2.75. §6.4 표와 일치.

## 보안상 중요한 두 지점

**웹훅은 서명 검증 전에 아무것도 쓰지 않는다.** 어느 프로젝트인지 알아야 시크릿을
찾을 수 있어서 페이로드를 먼저 읽지만, 읽는 값은 레포 식별자 하나이고 조회에만 쓴다.
거부된 요청이 `webhook_deliveries`에 흔적을 남기지 않는 것으로 확인했다.

연동 없음·시크릿 분실·서명 불일치는 **같은 401**이다. 구분해 주면 서명 없이
"이 레포가 연동돼 있는가"를 묻는 창구가 된다.

**`POST /projects/:id/logs`는 키의 프로젝트와 경로를 대조한다.** `ApiKeyGuard`는
"유효한 키인가"까지만 답한다. 이 검사가 없으면 유효한 키 하나로 모든 프로젝트에
로그를 밀어넣을 수 있고, @Public 라우트라 다른 방어선도 없다.

---

## Phase 7 — 배포: 착수 직전

설계서 Part 2 §5. 아직 코드를 쓰지 않았다.

### 범위
- Cloud Run 서비스 + Cloud SQL(Postgres) + Secret Manager
- `FileSecretStore` → Secret Manager 구현 교체 (`SECRET_STORE` 인터페이스는 그대로)
- 프로덕션 마이그레이션 실행 전략 — 지금은 컨테이너 기동 시 자동이고 **개발 전용**이다
- GitHub Actions CI/CD (§5.2)

### 넘겨받는 제약
- **`max-instances=1` 고정.** 인프로세스 EventEmitter2는 인스턴스 간 전달이 안 되므로
  인스턴스가 둘이면 A에 붙은 SSE 구독자가 B가 받은 웹훅을 영영 못 본다.
  Phase 1 결정이고 이제 SSE가 실제로 여기에 걸려 있다.
- **SSE와 Cloud Run 요청 타임아웃.** 하트비트로 유휴 종료는 막았지만 최대 요청 시간
  (기본 300초, 최대 60분)은 못 넘는다. 클라이언트 재연결이 전제다.
- `API_BASE_URL`이 웹훅 배달 URL의 근거다. 배포 도메인이 정해지면 기존 연동의
  웹훅 URL을 갱신해야 한다.

### 남은 것
- ~~`BUDGET_THRESHOLD_EXCEEDED`는 여전히 구독자가 없다.~~ Phase 7에서 SSE 넷째 타입
  `budget_alert`로 실었다(DESIGN_DRIFT.md 10번). 프로세스 밖 채널(메일·슬랙)은 여전히 없다.
- ~~lint 14건 (전부 Phase 6 이전부터 있던 prettier 포맷).~~ Phase 7에서 정리했고,
  CI가 `prettier --check`으로 두 앱을 본다.
- 개발 DB에 검증용 시드가 남아 있다: `git_integrations`의
  `kimtaewoo/muster-demo`(실재하지 않는 레포, `webhook_id=999`)와 세션·API 키 각 1건.
  연동 해제를 시도하면 GitHub 호출이 실패한다. Phase 7에서 DB를 새로 만들면 사라진다.

## 환경 상태 (2026-09-12 기준)
- 테스트 187개 통과, tsc exit 0
- 마이그레이션 9개, 엔티티 18개
- 컨테이너 기동 시 마이그레이션 자동 실행 (개발만)
- 남은 준비물: Cloud Run·Cloud SQL·Secret Manager
