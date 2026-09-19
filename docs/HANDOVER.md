# Muster 프로젝트 세션 인수인계서 (Handover Document)

- **작성 일시**: 2026-09-19
- **현재 브랜치**: `main` (최신 커밋 `d21f88b`, `origin/main`과 100% 동기화됨)
- **작업자 / 모델**: Antigravity (Gemini 2.5 Pro)
- **핵심 상태**:
  - ✅ **전수 테스트**: **762 passed, 762 total (100% All Green)** (API 507개, Web 222개, Connect/Hooks 33개)
  - ✅ **프로덕션 빌드**: `pnpm -r build` 0 error, 0 warning (API NestJS build 성공, Web Vite 번들링 365ms 완료)
  - ✅ **프로덕션 DB 마이그레이션**: `AddAgentRunModel1788910000000` (Supabase 프로덕션 적용 완료)
  - ✅ **Cloud Run 원격 배포**: 리비전 `muster-00041-fwc` 배포 완료 (`https://muster-54275961665.asia-northeast3.run.app`, 100% 트래픽 서빙, 헬스체크 200 OK)
  - ✅ **지식 그래프**: `graphify update .` 최신화 동기화 완료 (3,240 노드, 7,865 엣지, 178 커뮤니티)
  - ✅ **QA 증거**: Chrome CDP 기반 데스크톱 & 모바일 29종 스크린샷 캡처 완료 (`artifacts/` 및 세션 아티팩트 보관)

---

## 1. 금일 세션 완료 내역

### 🚀 [PR #69 (Squash Merged)](https://github.com/twenter1003/Muster/pull/69) 토큰 관제 6대 핵심 품질 개선

토큰 관제 시스템의 정합성, 시각적 분별력, 외부 LLM 장애 복원력 및 자동화 연동을 위한 **6대 핵심 품질 개선** 작업을 완수했습니다.

#### 1.1 `TokenStockChart` 하단 볼륨 막대 구간 소모 비용($) 전환 및 툴팁 개선
- **하단 바 스케일링 기준 변경**: 상단 라인(`tokens`)과 분리하여, 하단 볼륨 바를 해당 구간의 소모 비용(`d.cost`, $ USD)에 비례하도록 독립 스케일링(`maxCost` 기반, 최소 2px 높이 가드).
- **메트릭 힌트 뱃지 추가**: 차트 상단 범례 우측에 `선: 토큰 추이 · 막대: 구간 비용 ($)` 명시.
- **플로팅 툴팁 개선**: 툴팁 내부에서 `전체 토큰`과 `구간 비용`을 별도 행으로 독립 분리 표기.

#### 1.2 프로젝트 라우트 전환 시 라이브 틱 잔여 데이터 격리 플러시
- **`useSse` 커스텀 훅**: `projectId` 변경 시 `setEvents([])`를 호출하여 이전 프로젝트의 SSE 이벤트를 즉시 비우고 unmount 시 클린업.
- **`ProjectDetailPage`**: `id` 변경(`useEffect`) 시 `liveTick`, `burnRate`, `activeLiveRun`, `agentHeartbeats`를 초기화하여 타 프로젝트 이동 시 잔여 틱 깜빡임 완벽 차단.

#### 1.3 실측 트랜스크립트 모델명 바인딩 및 DB 스키마 마이그레이션
- **DB 스키마 & 마이그레이션**: `agent_runs.model` varchar(100) nullable 컬럼 추가 (`1788910000000-AddAgentRunModel.ts`).
- **도메인 이벤트 및 DTO**: `AgentRunStartedEvent`, `AgentRunHeartbeatEvent`, `AgentRunFinishedEvent`에 `model` 필드 반영.
- **에이전트 훅 및 연동 CLI**:
  - Claude Code (`report-agent-usage.mjs`): assistant 메시지 내 `model` 실측 추출.
  - Antigravity (`report-agent-usage.mjs`): `Model Selection` 로그 파싱 및 표준 모델명 정규화.
  - `muster-connect.mjs`: 임베디드 훅 스크립트 최신 Base64 동기화 및 33개 연동 테스트 통과.
- **예산 서비스 집계**: `budget.service.ts`의 `modelQb`를 `GROUP BY COALESCE(r.model, a.name)`으로 집계하여 실측 모델별 점유율 정확히 계산.

#### 1.4 Gemini LLM 장애 복원력 (지수 백오프 + 지터 + 타임아웃)
- **`apps/api/src/common/llm/retry.ts`**:
  - 최대 3회 재시도, 지수 백오프 (기본 1s, 2s, 4s) + Jitter.
  - 30초 타임아웃 AbortSignal 연동.
  - 재시도 대상: 429(Rate Limit), 500, 502, 503, 504 및 네트워크 단절(fetch failed, ECONNRESET, ETIMEDOUT, timeout abort).
  - 즉시 실패 대상: 400, 401, 403, 404 클라이언트 에러.
- **클라이언트 연동**: `HttpGeminiClient` 및 `VertexGeminiClient`에 공통 적용.

#### 1.5 라이브 틱 단조 증가 보정 & `burnRate` 안정화
- **단조 증가 가드**: `ProjectDetailPage`에서 `Math.max`를 적용하여 네트워크 지연이나 SSE 재전송 시 토큰·비용 카운트 역전 방지.
- **소모율 안정화**: `burnRate.ts`에서 음수 델타 0 클램핑 및 비정상 스파이크 방지.

#### 1.6 GitHub push 수신 시 목표 진행률 자동 갱신 훅 & 10분 쿨다운
- **이벤트 발행 (`WebhookIngestService`)**: push 웹훅 수신 시 `DomainEvent.CODE_PUSHED` 비동기 발행.
- **이벤트 구독 (`ProjectGoalsService`)**: `@OnEvent(DomainEvent.CODE_PUSHED, { async: true })` 리스너를 통해 목표 진행률 자동 분석 트리거.
- **10분 쿨다운 가드**: `lastAutoAnalysisMap` 인메모리 맵으로 프로젝트별 10분 쿨다운 적용 (LLM 비용 폭증 방지).
- **모듈 경계 준수**: `ingest` 모듈이 `project-goals`를 직접 참조하지 않고 EventEmitter2 도메인 이벤트로 디커플링 유지 (`module-boundary.spec.ts` 통과).

---

### 🌐 프로덕션 배포 완료 (Cloud Run)
- **DB 마이그레이션**: Supabase 프로덕션 DB에 `AddAgentRunModel1788910000000` 마이그레이션 적용 완료.
- **Cloud Run 서비스**: `muster` (`muster-twent` 프로젝트, `asia-northeast3` 리전).
- **배포 리비전**: `muster-00041-fwc` (100% 트래픽 서빙).
- **서비스 주소**: [https://muster-54275961665.asia-northeast3.run.app](https://muster-54275961665.asia-northeast3.run.app)
- **실시간 헬스체크 검증**: `HTTP/2 200 OK` (`{"status":"ok","uptime_seconds":12}`).

---

## 2. 코드베이스 구조 및 변경된 파일 요약

```
apps/api/
  ├── src/common/
  │   ├── events/domain-events.ts               # CODE_PUSHED 및 model 필드 추가
  │   └── llm/
  │       ├── retry.ts                          # [NEW] 지수 백오프 3회 재시도 복원력 엔진
  │       ├── retry.spec.ts                     # [NEW] 재시도 엔진 단위 테스트 (7건)
  │       ├── http-gemini-client.ts             # executeWithRetry 연동
  │       ├── http-gemini-client.spec.ts        # 재시도/비재시도 검증
  │       └── vertex-gemini-client.ts           # executeWithRetry 연동
  ├── src/database/
  │   ├── entities/agent-run.entity.ts          # model varchar(100) nullable 컬럼 추가
  │   └── migrations/
  │       └── 1788910000000-AddAgentRunModel.ts # [NEW] DB 스키마 마이그레이션
  └── src/modules/
      ├── agent-registry/
      │   ├── agent-runs.service.ts             # model 영속화 및 SSE 이벤트 탑재
      │   ├── agent-runs.service.spec.ts        # model 전달 검증
      │   └── budget.service.ts                 # 실측 model별 점유율 및 비용 집계
      ├── ingest/
      │   ├── webhook-ingest.service.ts         # push 이벤트 시 CODE_PUSHED 도메인 이벤트 발행
      │   ├── webhook-ingest.service.spec.ts    # 이벤트 발행 단위 테스트
      │   └── module-boundary.spec.ts           # Ingest 모듈 경계 무결성 검증
      └── project-goals/
          ├── project-goals.service.ts          # CODE_PUSHED 비동기 리스너 및 10분 쿨다운 가드
          └── project-goals.service.spec.ts     # 자동 분석 및 쿨다운 단위 테스트 (3건)

apps/web/
  ├── src/components/
  │   ├── TokenStockChart.tsx                   # 금액($) 비례 하단 바, 메트릭 힌트, 툴팁 분리
  │   ├── TokenStockChart.css                   # 힌트 뱃지 및 툴팁 스타일링
  │   └── TokenStockChart.spec.ts               # 금액 바 스케일링 단위 테스트 (3건 추가)
  ├── src/lib/
  │   └── useSse.ts                             # projectId 변경 시 이벤트 버퍼 플러시
  └── src/routes/
      ├── ProjectDetailPage.tsx                # 프로젝트 전환 시 틱 격리 및 단조 증가 가드
      └── ProjectDetailPage.spec.ts            # [NEW] 틱 격리 및 단조 증가 단위 테스트 (2건)

scripts/
  ├── claude-code-hooks/
  │   ├── report-agent-usage.mjs                # assistant 턴에서 model 실측 추출
  │   └── report-agent-usage.test.mjs           # 모델 추출 단위 테스트
  ├── antigravity-hooks/
  │   ├── report-agent-usage.mjs                # Model Selection 파싱 및 모델 식별
  │   └── report-agent-usage.test.mjs           # 모델 식별 단위 테스트
  ├── muster-connect.mjs                        # 최신 훅 Base64 임베딩 동기화
  └── qa-server-and-capture.mjs                 # QA 모의 서버 및 29종 스크린샷 캡처

docs/
  ├── DESIGN_DRIFT.md                           # 17번 항목(토큰 관제 6대 개선) 공식 추가
  ├── HANDOVER.md                               # 본 종합 인수인계 문서
  └── kickoff/PROMPT.md                         # 차기 세션 인계 프롬프트 최신화
```

---

## 3. 차기 세션 작업 후보 및 추천 로드맵

현재 메인 브랜치와 Cloud Run 프로덕션이 완벽히 안정화되었으며(All Green), 사용자 요구사항에 따라 다음 단계로 착수할 수 있는 핵심 과제 3가지를 정리합니다.

### 🎯 후보 1 (강력 추천): 프로세스 외부 알림 채널 연동 (Webhook / Slack / Discord)
- **배경 (DESIGN_DRIFT 10번 & 16번 후속)**:
  - 현재 `BUDGET_THRESHOLD_EXCEEDED` 및 `BUDGET_SPIKE_CRITICAL` 알림은 대시보드 화면을 열어둔 사용자에게만 SSE로 전달됨.
  - 사용자가 브라우저를 닫고 있거나 로컬에서 백그라운드로 장시간 에이전트를 돌릴 때, 비정상 토큰 폭주나 빌드/배포 실패를 즉시 인지할 수 없음.
- **구현 범위**:
  1. `Project` 엔티티에 `notification_webhook_url` (nullable varchar) 추가 및 암호화 보관.
  2. Slack 수신 웹훅(Incoming Webhook) 및 Discord 포맷 호환 어댑터 구현.
  3. 예산 급증(Budget Spike Critical) 또는 CI 배포 실패 발생 시 비동기 웹훅 알림 발송.
  4. 웹 화면의 프로젝트 설정/상세 모달에 알림 웹훅 등록 UI 추가.

### 🎯 후보 2: 다중 프로젝트 통합 토큰 롤업(Rollup) 비교 분석 대시보드
- **배경**:
  - 현재는 각 프로젝트 상세 화면(`/projects/:id`)에서 프로젝트별 토큰 추이와 모델 점유율을 확인함.
  - 여러 사이드 프로젝트(Muster, TWshop 등)를 동시에 운영하는 사용자가 **"내 계정 전체에서 이번 달 총 얼마를썼는가?"**, **"어느 프로젝트가 가장 토큰을 많이 소모하는가?"**를 한눈에 볼 수 있는 통합 집계 뷰 필요.
- **구현 범위**:
  1. `GET /api/v1/reports/token-rollup`: 전체 프로젝트 대상 일별/월별 누적 비용 및 모델별 합산 통계 엔드포인트.
  2. 홈 대시보드 또는 리포트 화면(`/reports`)에 프로젝트별 비용 비교 가로 막대 차트 및 누적 파이 차트 탑재.
  3. 전체 프로젝트 합산 CSV/JSON 내보내기 지원.

### 🎯 후보 3: GitHub Actions 자동 배포 파이프라인 정식 활성화
- **배경 (docs/DEPLOY.md 8단계)**:
  - 현재는 수동 스크립트(`./scripts/deploy-cloudrun.sh`)로 Cloud Run 배포를 수행함.
  - GitHub Actions Workload Identity Federation(WIF) 설정을 저장소 Variables에 등록하여, `main` 브랜치 PR 머지 시 자동으로 Cloud Run에 롤링 배포되도록 CI/CD 완결.
- **구현 범위**:
  1. GCP Workload Identity Pool 및 공급자 생성 스크립트 실행.
  2. 저장소 Variables 등록 (`GCP_WIF_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GCP_PROJECT`, `DEPLOY_URL`).
  3. `.github/workflows/deploy.yml`의 `push: branches: [main]` 주석 해제 및 자동 배포 검증.

---

## 4. 인계 시 필수 준수 사항 (Hard Constraints)

1. **지식 그래프 선행 조회**: 세션 시작 시 항상 `graphify query "<키워드>"`로 모듈 의존성을 먼저 확인할 것.
2. **세션 내 완결 원칙**: 브랜치 생성 → 구현 → 단위/통합 테스트 → 빌드 → 스크린샷 QA → PR 생성/머지 → 프로덕션 배포(필요 시) → `main` 동기화까지 한 세션 안에서 완결할 것.
3. **모듈 경계 무결성 준수**: `apps/api/src/modules/ingest` 모듈은 타 비즈니스 모듈(project-goals, agent-registry 등)을 직접 import하지 않으며, 반드시 `EventEmitter2` 도메인 이벤트를 통해 비동기 소통할 것 (`module-boundary.spec.ts` 상시 검증).
4. **강제 중단(Abort) 언급 금지**: PR #68에서 완전히 제거되었으므로 해당 기능은 건드리지 말 것.
5. **Excel 호환 및 다크 테마 일관성**: CSV는 UTF-8 BOM(`\uFEFF`) 및 RFC 4180을 준수하고, UI는 Emil Kowalski & 다크 글래스모피즘 톤앤매너를 유지할 것.
