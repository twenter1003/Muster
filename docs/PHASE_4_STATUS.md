# Phase 4 진행 상황 (2026-09-08 기준)

Phase 4는 **DocStore + AgentRegistry** 두 모듈이다 (README의 모듈→페이즈 표 기준).
둘 다 구현·테스트·실동작 검증까지 끝났다.

## 완료

### DocStore (설계서 Part 4 §4)

6개 엔드포인트. 실제 GCS로 전 구간 검증했다.

| 단계 | 확인한 것 |
|---|---|
| `POST /projects/:id/documents` | 201, 실제 signed upload URL (`X-Goog-Signature` 포함) |
| 업로드 전 `complete` 시도 | **400 거부** — 객체 존재를 실제로 검증한다 |
| signed URL로 GCS 직접 PUT | 200, 서버를 거치지 않음 |
| `POST /documents/:id/complete` | `pending` → `completed` |
| `GET /documents/:id` | 업로드한 내용이 그대로 회수됨 |
| `DELETE /documents/:id` | 204, GCS 객체와 레코드 모두 정리 |

`DOCUMENTS.upload_status` 컬럼을 추가했다 (ERD에는 있었으나 초기 스키마 누락).

### AgentRegistry (설계서 Part 4 §6)

10개 엔드포인트. 실동작 확인:

- 에이전트 생성 → 예산 설정(PUT) → API 키 발급 → 키로 실행 시작 → 실행 종료 → 사용률 85% 반영
- 키 없음 / 잘못된 키 모두 401로 차단됨
- `status` 오타(`success`)를 검증이 잡아냄 (`succeeded`가 맞다)

`X-API-Key` 검증 경로가 아예 없었다 — 키 발급·조회·폐기만 있었다. `ApiKeysService.resolveProject`와 `ApiKeyGuard`를 새로 만들었다.

### 테스트

**110개 전부 통과.** 새로 추가한 것:
- `documents.service.spec.ts` (11) — 업로드 3단계, 삭제 순서, 접근 제어
- `budget.service.spec.ts` (12) — 사용률 경계, 임계치 1회 발행
- `api-key.guard.spec.ts` (5) — 인증 우회 방지

## 이번에 부딪힌 함정 (재현될 것들)

1. **`roles/owner`에 `iam.serviceAccounts.getAccessToken`이 없다.** Google이 기본 역할에서 뺐다. 소유자면 다 되리라 기대하면 `IAM_PERMISSION_DENIED`의 원인을 한참 헤맨다. `scripts/setup-gcs.sh`가 이제 자동 부여한다. **IAM 반영에 1분쯤 걸린다.**
2. **`gcloud auth login`과 `gcloud auth application-default login`은 다르다.** 앞은 CLI용, 뒤는 애플리케이션용. SDK가 찾는 건 뒤쪽이다.
3. **사용자 ADC로는 signed URL에 서명할 수 없다.** 서명 주체(서비스 계정)를 알아야 한다. 로컬은 가장(impersonation)으로 푼다. Cloud Run은 메타데이터 서버가 알려주므로 불필요.
4. **GitHub은 localhost 웹훅 주소를 422로 거부한다.** 로컬 검증엔 터널이 필요하고, `API_BASE_URL`이 OAuth redirect_uri와 공유되므로 **로그인을 먼저 하고 주소를 바꿔야** 한다.

## 남은 결정 (사람이 정해야 함)

1. **Trivy / Conftest** — 로컬 설치 vs 도커 이미지에만. Phase 5 진입 시 결정.
2. **프로덕션 마이그레이션 실행 방식** — 개발 컨테이너는 기동 시 자동 실행하지만 프로덕션은 일부러 제외했다. 배포와 스키마 변경을 한 명령에 묶으면 롤백이 어려워진다. Phase 7에서 별도 단계로 설계할 것.

## 알려진 미완 (설계상 정상)

- **웹훅 수신 엔드포인트 없음** — `/api/v1/webhooks/github`는 `ingest/` 소관이고 **Phase 6**이다. 등록된 웹훅의 ping이 404를 받는 것은 지금으로선 정상.
- **예산 임계치 이벤트에 구독자가 없다** — `BUDGET_THRESHOLD_EXCEEDED`를 발행하지만 아직 아무도 듣지 않는다. Realtime 모듈(Phase 6)이 구독할 자리다. 발행 자체는 단위 테스트로 검증돼 있다.
- **`pending` 문서 24시간 정리 배치 미구현** — 설계서 Part 4 §4가 언급한 백스톱. 스케줄러를 붙일 시점(Phase 7 전후)에 만든다.

## 다음

**Phase 5 — EnvCatalog** (설계서 Part 4 §5). 준비물 상태:
- `GEMINI_API_KEY` — 설정 완료
- Trivy/Conftest — 위 결정 필요

Phase 4를 닫고 Phase 5로 갈지는 승인이 필요하다 (페이즈 게이트).
