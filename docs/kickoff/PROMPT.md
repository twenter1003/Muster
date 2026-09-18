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

- **세션 강제 중단(Abort) 기능 제거 및 UI/API 리팩터링 (PR #68 - 03b666b)**
  - 대시보드에서 '강제 중단'을 눌러도 로컬 CLI 에이전트 프로세스 자체가 물리적으로 `kill -9`되는 것이 아니므로, 사용자 기대 불일치와 운영 리스크를 원천 차단하기 위해 중단 기능을 UI 및 API 전반에서 완전히 제거.
  - `SessionWasteModal`: `[🚨 세션 강제 중단]` 버튼 및 에러 블록 제거, 실시간 작업 안내 배너로 교체. (낭비 진단 패널, 4분할 메트릭, CSV/JSON 다운로드는 100% 유지)
  - `ProjectDetailPage`: 최근 세션 목록 내 인라인 `[중단]` 버튼 및 `BudgetSpikeAlertBanner`의 `[🚨 세션 중단]` 버튼 제거 (`[🔍 낭비 딥다이브]` 버튼 유지).
  - `apps/api`: `POST /agent-runs/:id/abort`, `POST /agents/:agentId/runs/:runId/abort` 엔드포인트 및 `AgentRunsService.abort()` 서비스 로직 삭제.
  - 테스트: API 495개 + Web 217개 + Connect 13개 = 총 725개 전수 테스트 100% All Green.
  - Cloud Run 프로덕션 배포 완료: 리비전 `muster-00040-xlv` (헬스체크 200 OK).

- **에이전트 세션별 토큰/비용 낭비 이력 내보내기(Export) 및 캐싱 절감 ROI 시뮬레이션 리포트 다운로드 구축 (PR #67 - 19cd598)**
  - 백엔드:
    - `budget.service.ts`: `generateWasteReportJson(projectId)` (세션별 낭비 상세, 메트릭, 90% 캐시 ROI 시뮬레이션), `generateWasteReportCsv(projectId)` (Excel 호환 RFC 4180 + UTF-8 BOM `\uFEFF`, 요약 행 `[SUMMARY]`).
    - `agents.controller.ts`: `@Get(':id/waste-report.csv')`, `@Get(':id/waste-report.json')` 스트리밍 엔드포인트 구현.
  - 프론트엔드:
    - `exportUtils.ts`: `downloadReportFile` (RFC 5987 / Content-Disposition 파싱, Blob 가상 링크 트리거).
    - `TokenWasteIntelligenceCard.tsx` & `SessionWasteModal.tsx`: `[📥 CSV 리포트]`, `[📥 JSON]` 버튼 그룹 및 다운로드 상태 알림 배너 연동.
  - 전수 검증: 729개 테스트 통과, Chrome CDP 기반 29종 스크린샷 캡처 완료.

- **에이전트 세션별 토큰/비용 낭비 이력 딥다이브 모달 구축 (PR #66)**
- **실시간 토큰 소모 속도(Burn Rate) 추적 및 예산 급증(Budget Spike) 조기 경보 HUD 구축 (PR #65)**
- **TokenStockChart 마우스 호버 플로팅 툴팁 및 다중 에이전트 오버레이 구축**

---

## 차기 세션 최우선 착수 과제 (Current Priority Task)

### 🎯 토큰 관제 6대 핵심 품질 개선 (차트 금액 바 전환, 프로젝트 틱 격리, 모델명 실측 바인딩, LLM 재시도 복원력, 라이브 틱 안정화, 커밋 기반 목표 갱신 훅)

> **상태 알림**: PR #68 머지 및 로컬 `main` 동기화 완료 (`03b666b`), 전체 725개 테스트 All Green 상태.  
> **다음 세션 에이전트는 본 프롬프트를 확인한 즉시 아래 4인 원팀 설계서에 따라 브랜치 생성 및 구현에 착수할 것.**

#### 1. 👥 4인 원팀 확정 설계 명세

- **📌 PM (기획 및 인터페이스 계약)**:
  1. **차트 바 그래프를 금액($)으로 전환**: 상단 라인은 토큰 사용량(`tokens`), 하단 바는 해당 구간 비용(`cost`, $ USD)으로 분리하여 주식 차트(상단 가격 + 하단 거래대금 볼륨) 스타일로 정보 가치 극대화.
  2. **프로젝트 간 라이브 틱 격리**: Muster 프로젝트에서 에이전트 사용 중 TWshop 프로젝트 페이지로 이동했을 때 이전 프로젝트의 활성 틱이 깜빡이는 상태 누수 원천 차단.
  3. **실제 사용 모델명 표기**: `claude-sonnet-5`, `gemini-3.6-flash` 같은 하드코딩 추론 대신, 실제 사용자가 쓴 모델(Claude 3.5 Sonnet, Gemini 2.5 Flash 등)을 수집하여 대시보드와 최근 세션에 표시.
  4. **LLM 호출 간헐적 실패 복원력**: Gemini API 호출 시 일시적 429/503/네트워크 지연 발생 시 3회 지수 백오프 자동 재시도로 무중단 신뢰성 보장.
  5. **라이브 틱 단조 증가 안정화**: 틱 수치 역전 방지 및 부드러운 애니메이션/보간 처리.
  6. **커밋 기반 자동 목표 갱신 훅**: Git 커밋(`push` 웹훅) 시 목표 진행률을 자동 재분석하되, API 비용 방지를 위해 10분 쿨다운 및 수동 `[새로 분석]` 버튼 병행 제공.

- **⚙️ 백엔드 (Backend)**:
  1. `AgentRun` 엔티티 및 DTO에 `model` 컬럼 추가 (nullable varchar(100)). 마이그레이션 생성 (`AddAgentRunModel`).
  2. `agent-runs.service.ts`: 실행 기록 저장(`recordByRepo`, `start`, `heartbeat`) 시 `model` 필드 영속화 및 SSE 이벤트에 `model` 탑재.
  3. `budget.service.ts`:
     - `modelQb`: `GROUP BY COALESCE(r.model, a.name), a.name`으로 집계하여 실제 모델 기준 분류.
     - `model_breakdown`: `this.modelPricing.resolvePricing(row.model_code, row.agent_name)`으로 실측 모델 단가/표시명 바인딩.
     - `recent_runs`: `model: r.model ?? undefined` 제공.
  4. `http-gemini-client.ts` & `vertex-gemini-client.ts`:
     - `executeWithRetry()`: 3회 재시도 (1s, 2s, 4s + Jitter), 429/503/500/네트워크 오류 대응, 30초 타임아웃.
  5. `webhook-ingest.service.ts`:
     - GitHub push 웹훅 수신 시 `ProjectGoalsService.analyzeProgress` 비동기 트리거. 10분 쿨다운 가드로 중복 방지.

- **🎨 프론트엔드 (Frontend & Hooks)**:
  1. `scripts/claude-code-hooks/report-agent-usage.mjs`:
     - `sumUsageFromTranscript`에서 `entry.message?.model` 추출하여 API payload에 `model` 포함.
  2. `scripts/antigravity-hooks/report-agent-usage.mjs`:
     - transcript / SQLite 메타데이터에서 실측 모델명 추출 및 전송.
  3. `scripts/muster-connect.mjs`:
     - 임베디드 훅 스크립트 Base64 동기화.
  4. `apps/web/src/components/TokenStockChart.tsx`:
     - 하단 볼륨 바 높이를 `cost` 기준으로 스케일링: `costVal = Number(p.d.cost) || 0`, `maxCost = Math.max(...costs, 0.0001)`, `barH = (costVal / maxCost) * barMaxH`.
     - 툴팁 및 범례에 "선: 토큰 추이 / 막대: 구간 비용 ($)" 표기 및 호버 시 `formatCost` 포맷팅.
  5. `apps/web/src/routes/ProjectDetailPage.tsx`:
     - `useEffect(() => { setActiveAgents([]); setAgentStartTimes({}); setAgentHeartbeats({}); }, [id]);` 추가하여 프로젝트 간 틱 완전 격리.
     - 틱 수치 단조 증가 가드 (`Math.max(prev, next)`).
  6. `apps/web/src/lib/useSse.ts`:
     - `projectId` 변경 시 `setEvents([])` 클린업.

- **🧪 QA (검증 및 시각적 증거)**:
  1. 전수 단위 테스트 All Green (725+개 테스트 통과).
  2. `TokenStockChart.spec.ts`: 금액 바 렌더링 및 툴팁 금액 표기 검증.
  3. `http-gemini-client.spec.ts`: 429/503 시 3회 재시도 복구 단위 테스트.
  4. `ProjectDetailPage.spec.ts`: 프로젝트 전환 시 틱 격리 검증.
  5. 전체 워크스페이스 빌드(`pnpm -r build`) 0 error, 0 warning.
  6. Chrome CDP 기반 데스크톱 & 모바일 스크린샷 캡처.
  7. `graphify update .` 지식 그래프 최신화.

---

#### 2. 🚀 차기 세션 실행 절차 (Turn-Key Runbook)
1. **브랜치 생성**:
   ```bash
   git checkout main && git pull origin main
   git checkout -b feat/token-monitoring-refinement
   ```
2. **구현 및 단위 테스트 (순차 진행)**:
   - Step 1: 프로젝트 간 라이브 틱 격리 (`ProjectDetailPage.tsx`, `useSse.ts`)
   - Step 2: 실측 모델명 추출 및 DB/API 연동 (`report-agent-usage.mjs`, `agent-run.entity.ts`, `budget.service.ts`)
   - Step 3: `TokenStockChart` 하단 바 그래프 금액($) 전환 (`TokenStockChart.tsx`, `.css`)
   - Step 4: Gemini LLM 지수 백오프 3회 재시도 복원력 (`http-gemini-client.ts`, `vertex-gemini-client.ts`)
   - Step 5: 라이브 틱 안정화 및 단조 증가 보정 (`ProjectDetailPage.tsx`, `burnRate.ts`)
   - Step 6: Git 커밋 기반 자동 목표 갱신 훅 & 10분 쿨다운 (`webhook-ingest.service.ts`)
3. **전수 검증, 포맷팅, 빌드**:
   ```bash
   pnpm -r test && pnpm -r build
   ```
4. **화면 캡처 (Chrome CDP)**:
   ```bash
   node scripts/qa-server-and-capture.mjs
   ```
5. **지식 그래프 동기화**:
   ```bash
   graphify update .
   ```
6. **PR 생성, CI 통과, 머지, main 동기화**:
   ```bash
   git push origin feat/token-monitoring-refinement
   gh pr create --title "feat(monitoring): 토큰 관제 6대 핵심 품질 개선" ...
   gh pr checks <PR_NO> --watch
   gh pr merge <PR_NO> --squash --delete-branch
   git checkout main && git pull origin main
   ```

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
