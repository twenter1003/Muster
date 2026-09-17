# Muster 개발 인계 프롬프트

이 문서는 이전 에이전트가 작업하던 Muster 프로젝트를 새 세션의 에이전트(Claude Code, Antigravity/Gemini 등)에게 넘길 때 그대로 전달하는 킥오프 프롬프트다.

---

## 🛑 세션 시작 시 필수 실행 절차 (Hard Gate: 반드시 순서대로 수행)

에이전트는 사용자에게 첫 응답을 하기 전, **반드시 아래 4단계를 순서대로 수행**해야 한다. (이 문서를 맹신하여 코드 조회를 건너뛰지 말 것)

1. **지식 그래프 조회 (`graphify`) [필수]**:
   - `CLAUDE.md`의 graphify 규칙을 확인한다.
   - `graphify-out/graph.json`이 구축되어 있으므로, 차기 작업 키워드로 지식 그래프를 가장 먼저 쿼리하여 모듈 의존성을 파악한다.
     ```bash
     graphify query "<차기 과제 관련 키워드>"
     ```
   - 특정 노드 관계나 아키텍처 확인이 필요할 때는 `graphify explain "<심볼/파일명>"`, `graphify path "<A>" "<B>"`를 활용한다.
2. **저장소 및 테스트 무결성 검증**:
   - `git status` 및 `git log -n 5`로 최신 커밋 상태 확인.
   - `pnpm -r test`를 실행하여 기존 테스트가 All Green인지 확인.
3. **설계 괴리 및 배포 함정 확인**:
   - [docs/DESIGN_DRIFT.md](../DESIGN_DRIFT.md) (설계서와 실제가 갈라진 14개 항목 — **최종 진실**)
   - [docs/DEPLOY.md](../DEPLOY.md) (Cloud Run 배포 및 Supabase 함정)
4. **4인 원팀(PM, 백엔드, 프론트엔드, QA) 설계안 제시 및 승인**:
   - 임의로 코딩을 시작하지 않고, PM의 요구사항/API 계약, 백엔드/프론트엔드 구현 범위, QA 검증 계획을 포함한 Bounded/Architectural 설계를 제시하고 **사용자의 명시적 승인 후 구현에 착수**한다.

---

## 프로젝트 개요

Claude Code/LLM 기반으로 여러 사이드 프로젝트를 진행하는 사용자가, GitHub 레포를 연동하면 커밋·배포·로그·에러·LLM 토큰/비용·목표 달성률을 한눈에 관제하는 개인용 대시보드.

- **아키텍처 및 모듈 관계**: 정적 문서를 읽지 말고 **`graphify-out/` 지식 그래프**를 조회할 것.
- **배포 환경**: Cloud Run(`muster`, GCP 프로젝트 `muster-twent`, 리전 `asia-northeast3`) + Supabase Postgres.
- **핵심 문서**:
  - `docs/DESIGN_DRIFT.md` (화면 구조/기능 설계의 최종 진실)
  - `docs/LLM_ECOSYSTEM_GUIDE.md` (2026 최신 모델 라인업, 단가표, 프롬프트 캐싱 할인율)
  - `docs/AGENT_TOKEN_REPORTING.md` (`npx muster-connect` 및 에이전트 훅)
  - `docs/BUG_REPORTS.md` (5분 초고속 장애 진단 런북)

---

## 최근 완료된 것 (최신순, 상세는 git log)

- **에이전트 세션별 토큰/비용 낭비 이력 내보내기(Export) 및 캐싱 절감 ROI 시뮬레이션 리포트 다운로드 구축 (PR #67)**
  - 백엔드:
    - `budget.service.ts`:
      - `generateWasteReportJson(projectId)`: 최근 세션 낭비 상세 목록(최대 100건), 총 집계 메트릭, 프롬프트 캐싱 ROI 시뮬레이션 데이터 생성.
      - `generateWasteReportCsv(projectId)`: Excel 호환 RFC 4180 및 UTF-8 BOM(`\uFEFF`) 준수 CSV 직렬화, 세션 행 및 요약 행(`[SUMMARY]`) 출력.
    - `agents.controller.ts`:
      - `@Get(':id/waste-report.csv')`, `@Get(':id/waste-report.json')` 엔드포인트 구현 (적절한 `Content-Type`, `Content-Disposition: attachment; filename=...` 헤더 제공).
    - 유닛 테스트: `budget.service.spec.ts` 2건 추가, `agents-report.controller.spec.ts` 신설 2건 추가.
  - 프론트엔드:
    - `exportUtils.ts` 신설: `downloadReportFile(path, defaultFilename)` (RFC 5987 / Content-Disposition 파싱, Blob 생성 및 가상 링크 다운로드 트리거, window/document 가드).
    - `exportUtils.spec.ts` 신설: 7건 단위 테스트 전수 통과.
    - `TokenWasteIntelligenceCard.tsx` & `.css`: 상단 헤더에 `[📥 CSV 리포트]`, `[📥 JSON]` 버튼 그룹 및 다운로드 상태 피드백 배너(`exportNotice`) 탑재.
    - `SessionWasteModal.tsx` & `.css`: 하단 footer 액션바에 `[📥 전체 리포트 (CSV)]`, `[📥 JSON]` 버튼 및 다운로드 상태 피드백 탑재.
    - `ProjectDetailPage.tsx`: `TokenWasteIntelligenceCard` 및 `SessionWasteModal`에 `projectId={id}` 바인딩.
    - `TokenWasteIntelligenceCard.spec.ts` 3건 및 `SessionWasteModal.spec.ts` 2건 테스트 추가.
  - 전수 검증:
    - API 498개 + Web 218개 + Connect 13개 = **총 729개 전수 유닛 테스트 100% 통과 (All Green)**.
    - `pnpm -r build` (Nest build + Vite build) 0 error, 100% 성공.
    - Chrome CDP 기반 29종 스크린샷 캡처 완료 (`desktop-waste-report-export.png`, `mobile-waste-report-export.png`, `desktop-modal-waste-report.png` 등).
    - 지식 그래프 `graphify update .` 최신화 동기화 완료 (3,200 노드, 7,821 엣지, 183 커뮤니티).
- **에이전트 세션별 토큰/비용 낭비 이력 딥다이브 모달 및 원클릭 세션 중단(Kill/Abort) 기능 구축 (PR #66)**
  - 백엔드:
    - `AUDIT_ACTIONS`에 `'agent_run.abort'` 추가 및 감사 추적 기록 연동.
    - `AgentRunsService.abort()`: `running` 상태 검증, `cancelled` 전이, 종료 시각 기록, 예산 재계산, SSE `AGENT_RUN_FINISHED` 실시간 이벤트 브로드캐스트.
    - `AgentRunsService.heartbeat()`: 세션이 `cancelled` 상태일 때 `409 Conflict` 반환하여 로컬 CLI 에이전트 프로세스 즉시 종료 신호 전달.
    - `AgentRunsService.detail()`: 세션 단건 상세 및 낭비 진단(waste) 통계 조회 (`SessionRunDetailView`).
    - `POST /api/v1/agent-runs/:id/abort`, `GET /api/v1/agent-runs/:id`, `POST /api/v1/agents/:agentId/runs/:runId/abort` 엔드포인트 구현.
    - 유닛 테스트 5건 추가 (`agent-runs.service.spec.ts`).
  - 프론트엔드:
    - `SessionWasteModal` 신설: Emil Kowalski & Minimalist UI 기반 다크 글래스모피즘 모달, 4분할 핵심 메트릭 그리드 (총 토큰, 소모 비용, 소요 시간, 분당 소모율 Burn Rate), 낭비 진단 패널 (`HIGH_WASTE` / `CAUTION` / `NORMAL`), `[🚨 세션 강제 중단 (Abort)]` 버튼 및 로딩/에러 피드백.
    - `ProjectDetailPage`: 최근 세션 목록 행 클릭 시 `SessionWasteModal` 오픈 인터랙션 연동, `running` 세션 인라인 `[중단]` 버튼 탑재, 상단 `BudgetSpikeAlertBanner`에 `[🚨 세션 중단]` 및 `[🔍 낭비 딥다이브]` 원클릭 버튼 연동.
    - `SessionWasteModal.spec.ts` 6건 단위 테스트 작성 및 전수 통과.
  - 테스트: API 494개 + Web 208개 + Connect 13개 = **총 715개 전수 유닛 테스트 100% All Green**.
  - 시각적 증거: Chrome CDP 기반 26종 스크린샷 캡처 (데스크톱/모바일 세션 낭비 모달, 스파이크 배너, 최근 세션 목록) 완료.
  - 지식 그래프: `graphify update .` 동기화 완료 (3,183 노드, 7,768 엣지).
- **에이전트별 실시간 토큰 소모 속도(Burn Rate) 추적 및 예산 급증(Budget Spike) 조기 경보 HUD 구축 (PR #65)**
  - 백엔드 `burn-rate.ts`: 최근 15분 윈도우 및 활성 세션 기반 `computeBurnRate` 도메인 수식(SpikeLevel: normal/warning/critical, 임계치 30k, 60k tokens/min, $0.50/min) 및 recommendation 생성기 구현.
  - `budget.service.ts`: `calculateBurnRate()` 메서드 신설 및 `dailyUsage()` 응답의 `UsageBreakdown` 내 `burn_rate` 필드 통합 제공.
  - `agents.controller.ts`: `GET /projects/:id/burn-rate` 엔드포인트 신설.
  - 프론트엔드 `burnRate.ts`: k/min, M/min 속도 포맷터, 스파이크 등급 평가, SSE 실시간 하트비트 결합 60fps 연산 유틸리티 구현.
  - `TokenStockChart.tsx` & `.css`: 상단 HUD 실시간 Burn Rate 뱃지(Normal 에메랄드, Warning 앰버, Critical 레드 글로우 펄스) 및 에이전트별 세부 소모 속도 미니 팝오버 탑재.
  - `ProjectDetailPage.tsx` & `.css`: 비정상 급증(Warning/Critical) 감지 시 상단 조기 경보 배너(`[data-testid="budget-spike-alert"]`) 렌더링.
  - 테스트: API 489개 + Web 202개 + Connect 13개 등 총 704개 전수 유닛 테스트 100% 통과 (All Green).
  - `graphify update .`를 통한 지식 그래프 최신화 동기화 완료 (3,172 노드, 7,673 엣지).
- **TokenStockChart 마우스 호버 인터랙티브 플로팅 툴팁(Floating Tooltip) 및 다중 에이전트 수치 인포박스 구축**
- **프로젝트 상세 에이전트별(Claude Code vs Antigravity/Gemini vs Cursor) 토큰 사용량 비교 필터링 및 TokenStockChart 오버레이 강화**
- **에이전트 토큰 낭비 인텔리전스 및 2026 프롬프트 캐싱(Prompt Caching) 최적화 가이드 대시보드 구축**
- **에이전트 세션 실시간 중간 토큰(Heartbeat) 스트리밍 연동 & 대시보드 라이브 틱(Tick) 갱신 (Cloud Run 배포 완료)**
- **코드베이스 전체 지식 그래프(Knowledge Graph) 구축 (`/graphify .`)**

---

## 차기 세션 최우선 착수 과제 (Current Priority Task)

### 📊 최근 세션 낭비 탐색기(Session Waste Explorer) 구축: 고낭비 세션 필터(High-Waste/Caution/Normal)·에이전트별/상태별 필터링·검색 및 페이징 고도화

> **상태 알림**: PR #67 머지 및 로컬 `main` 동기화 완료 (`19cd598`), 전체 729개 테스트 All Green 상태.
> **다음 세션 에이전트는 본 프롬프트를 확인한 즉시 아래 설계서에 따라 브랜치 생성 및 구현에 착수할 것.**

#### 1. 👥 4인 원팀 확정 설계 명세

- **📌 PM (기획 및 인터페이스 계약)**:
  - **배경**: 현재 최근 세션 카드(`recent-runs-card`)는 상위 4개 세션만 고정 노출(`slice(0, 4)`)되어, 수십 개의 세션 중 실제 토큰과 예산을 낭비하는 `HIGH_WASTE` 세션만을 골라내거나, 현재 실행 중(`running`)인 세션만을 선별하여 중단(Abort)하기 어려움.
  - **핵심 요구사항**:
    1. **위험도 탭/칩 필터**: `전체`, `🚨 고낭비(High Waste)`, `⚠️ 주의(Caution)`, `정상(Normal)` 즉시 필터링.
    2. **에이전트 및 상태 필터**: 에이전트(`All`, `Claude Code`, `Antigravity`, `Cursor`), 상태(`All`, `실행 중(running)`, `완료(completed)`, `중단(cancelled)`).
    3. **실시간 검색**: 세션 ID 앞자리 또는 모델명 인라인 검색.
    4. **정렬 및 페이지네이션**: 비용순(Cost), 토큰순(Tokens), 최신순(Recent) 정렬 토글 및 5/10/20개 단위 페이지네이션 또는 '더보기' 확장.
    5. **원클릭 액션 연동**: 각 행 클릭 시 `SessionWasteModal` 딥다이브 오픈, `running` 행 인라인 `[중단]` 연동.

- **⚙️ 백엔드 (Backend)**:
  - `apps/api/src/modules/agent-registry/budget.service.ts`:
    - `dailyUsage` 응답의 `recent_runs` 데이터가 충분한 세션 수(최대 50~100건)와 진단 메트릭(`waste_level`, `wasted_tokens`, `burn_rate`, `model`)을 일관되게 제공하는지 확인 및 보강.
    - 필요 시 세션 목록 조회 쿼리 파라미터 지원.

- **🎨 프론트엔드 (Frontend - Minimalist UI & Emil Kowalski 스타일)**:
  - `apps/web/src/components/SessionWasteExplorer.tsx` 신설:
    - 감각적인 다크 글래스모피즘 툴바: 필터 탭(All, High Waste, Caution, Running), 에이전트 선택 드롭다운/칩, 검색 인풋.
    - 세션 목록: 데스크톱에서는 낭비율/비용/토큰/소요시간/속도/상태 컬럼 정렬 테이블, 모바일에서는 스택 카드 레이아웃.
    - 각 항목 호버/클릭 시 미세한 스케일 트랜지션 및 `SessionWasteModal` 오픈.
    - `SessionWasteExplorer.spec.ts` 단위 테스트 작성.
  - `apps/web/src/routes/ProjectDetailPage.tsx`:
    - 기존 4건 고정 슬라이스 영역을 `SessionWasteExplorer` 컴포넌트로 깔끔하게 교체.

- **🧪 QA (검증 및 시각적 증거)**:
  - 프론트엔드 필터/검색/정렬 단위 테스트 All Green (729개 + 신규 테스트 통과).
  - 전체 워크스페이스 빌드(`pnpm -r build`) 0 error, 0 warning.
  - Chrome CDP 기반 데스크톱 & 모바일 필터링 화면 스크린샷 캡처.
  - `graphify update .` 지식 그래프 최신화.

#### 2. 🚀 차기 세션 실행 절차 (Turn-Key Runbook)
1. **브랜치 생성**:
   ```bash
   git checkout main && git pull origin main
   git checkout -b feat/session-waste-explorer
   ```
2. **프론트엔드 & 백엔드 구현 및 테스트**:
   - `SessionWasteExplorer.tsx`, `SessionWasteExplorer.css`, `SessionWasteExplorer.spec.ts` 작성.
   - `ProjectDetailPage.tsx` 연동.
   - `pnpm -r test` 통과 확인.
3. **전수 검증, 포맷팅, 빌드**:
   - `pnpm format && pnpm -r test && pnpm -r build`
4. **화면 캡처 (Chrome CDP)**:
   - `node scripts/qa-server-and-capture.mjs` 실행 (신규 캡처 스텝 추가).
5. **지식 그래프 동기화**:
   - `graphify update .`
6. **PR 생성, CI 통과, 머지, main 동기화**:
   - `git push origin feat/session-waste-explorer`
   - `gh pr create ...` → CI 확인 → `gh pr merge ... --squash --delete-branch` → `git checkout main && git pull origin main`

---

## 작업 관례 (사용자 필수 지침)

- **4인 팀(PM, 백엔드, 프론트엔드, QA) 원팀 협업**:
  - "항상 프론트, 백엔드, QA, PM 넷이서 한 팀으로 서로 소통하면서 움직여야 돼"
  - PM의 계약 하에 백엔드와 프론트엔드가 소통하고, QA가 실측과 시각적 증거(스크린샷)로 검증한다.
- **세션 내 완결 원칙**:
  - 테스트·빌드 검증 → 새 브랜치 커밋 → 푸시 → PR 생성 → CI 통과 확인 → 머지 → 로컬 main 동기화까지 한 세션 안에서 완료한다.
- **프론트엔드 시각적 증거(스크린샷) 필수**:
  - UI 수정 시 반드시 실제 렌더링된 화면 스크린샷(데스크톱 및 모바일 반응형)을 사용자에게 제시한다.
- **코드 수정 후 graphify 갱신**:
  - 주요 기능 완료 후 `graphify update .`를 실행하여 지식 그래프를 동기화한다.
- **세션 종료 전 PROMPT.md 갱신**:
  - 세션을 넘길 때 완료 내역과 다음 과제를 반영해 이 문서를 최신화한다.
- **커밋 메시지**: Conventional Commits 스타일, 본문에 "왜"를 적고 자신의 모델명을 기재한다.
