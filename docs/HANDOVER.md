# Muster 프로젝트 세션 인수인계서 (Handover Document)

- **작성 일시**: 2026-09-18
- **현재 브랜치**: `main` (최신 커밋 `03b666b`, `origin/main`과 100% 동기화됨)
- **작업자 / 모델**: Antigravity (Gemini 2.5 Pro)
- **핵심 상태**:
  - ✅ **전수 테스트**: **725 passed, 725 total (100% All Green)** (API 495개, Web 217개, Connect 13개)
  - ✅ **프로덕션 빌드**: `pnpm -r build` 0 error, 0 warning (API NestJS build 성공, Web Vite 번들링 375ms 완료)
  - ✅ **Cloud Run 원격 배포**: 리비전 `muster-00040-xlv` 배포 완료 (`https://muster-xcswvn6m2q-du.a.run.app`, 헬스체크 200 OK)
  - ✅ **지식 그래프**: `graphify update .` 최신화 동기화 완료 (3,216 노드, 7,814 엣지, 183 커뮤니티)
  - ✅ **QA 증거**: Chrome CDP 기반 데스크톱 & 모바일 29종 스크린샷 캡처 완료

---

## 1. 금일 세션 완료 내역

### 🧹 [PR #68 (Squash Merged)](https://github.com/twenter1003/Muster/pull/68) 세션 강제 중단(Abort) 기능 제거 및 UI/API 리팩터링
- **배경**: 대시보드에서 '강제 중단'을 눌러도 로컬 머신에서 실행 중인 Claude Code / Antigravity CLI 프로세스 자체가 물리적으로 `kill -9`되는 것은 아니므로, 사용자 기대 불일치와 운영 리스크를 원천 차단하기 위해 중단 기능을 UI 및 API 전반에서 깔끔하게 제거.
- **주요 변경점**:
  - `SessionWasteModal`: `[🚨 세션 강제 중단]` 버튼 및 에러 블록 제거, 실시간 작업 안내 배너로 교체. (낭비 진단 패널, 4분할 메트릭, CSV/JSON 다운로드는 100% 유지)
  - `ProjectDetailPage`: 최근 세션 목록 내 인라인 `[중단]` 버튼 및 `BudgetSpikeAlertBanner`의 `[🚨 세션 중단]` 버튼 제거 (`[🔍 낭비 딥다이브]` 버튼 유지).
  - `apps/api`: `POST /agent-runs/:id/abort`, `POST /agents/:agentId/runs/:runId/abort` 엔드포인트 및 `AgentRunsService.abort()` 서비스 로직 삭제.
  - 테스트 갱신: API 495개 + Web 217개 + Connect 13개 = 총 725개 전수 테스트 100% 통과.

### 📊 [PR #67 (Squash Merged)](https://github.com/twenter1003/Muster/pull/67) 세션별 토큰/비용 낭비 이력 내보내기(Export) 및 캐싱 절감 ROI 시뮬레이션 리포트 다운로드 기능 구축

#### 1.1 백엔드 (API)
- `apps/api/src/modules/agent-registry/budget.service.ts`:
  - `generateWasteReportJson(projectId)`: 최대 100건의 세션별 낭비 상세 목록, 전체 집계 메트릭, 2026 프론티어 모델의 90% 캐시 읽기 할인율을 적용한 전/후 절감 잠재액(`potential_savings`, `savings_percentage`) 시뮬레이션 엔진 구현.
  - `generateWasteReportCsv(projectId)`: Excel 호환 RFC 4180 및 UTF-8 BOM(`\uFEFF`) 적용, 13개 컬럼의 세션 데이터 행 직렬화 및 최하단 `[SUMMARY]` 요약 행 산출.
- `apps/api/src/modules/agent-registry/agents.controller.ts`:
  - `GET /projects/:id/waste-report.csv`: CSV 스트리밍 다운로드 엔드포인트 (`Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="muster-waste-report-{id}-{date}.csv"`).
  - `GET /projects/:id/waste-report.json`: 구조화 JSON 다운로드 엔드포인트 (`Content-Type: application/json; charset=utf-8`).
- `apps/api/src/modules/agent-registry/agents-report.controller.spec.ts` (신설): 응답 헤더 및 컨트롤러 연동 테스트 2건 작성.
- `apps/api/src/modules/agent-registry/budget.service.spec.ts`: JSON/CSV 직렬화 및 요약 행 산출 단위 테스트 2건 추가.

#### 1.2 프론트엔드 (Web)
- `apps/web/src/lib/exportUtils.ts` (신설):
  - `downloadReportFile(path, defaultFilename)`: 네이티브 `fetch` 기반 Blob 다운로드, RFC 5987 / `Content-Disposition` 파싱, 가상 `<a>` 엘리먼트 생성 및 클릭 트리거, 브라우저/Node 환경 가드 구현.
  - `apps/web/src/lib/exportUtils.spec.ts` (신설): 7건 단위 테스트 전수 통과.
- `apps/web/src/components/TokenWasteIntelligenceCard.tsx` & `.css`:
  - 상단 헤더 우측에 `[📥 CSV 리포트]`, `[📥 JSON]` 버튼 그룹 배치.
  - 클릭 시 마이크로 모션(`transform: scale(0.97)`) 및 다운로드 상태 알림 배너(`exportNotice`) 노출.
- `apps/web/src/components/SessionWasteModal.tsx` & `.css`:
  - 하단 footer 액션바에 `[📥 전체 리포트 (CSV)]`, `[📥 JSON]` 버튼 탑재 및 다운로드 즉각 피드백 연동.
- `apps/web/src/routes/ProjectDetailPage.tsx`:
  - `TokenWasteIntelligenceCard` 및 `SessionWasteModal`에 `projectId={id}` 바인딩.

#### 1.3 QA 검증 및 시각적 증거
- `scripts/qa-server-and-capture.mjs`: 리포트 모의 응답 및 캡처 스텝 추가.
- 신규 스크린샷 3종 확보:
  - `desktop-waste-report-export.png`: 토큰 낭비 인텔리전스 카드 내보내기 버튼 및 실시간 알림 뷰
  - `mobile-waste-report-export.png`: 모바일 반응형 내보내기 버튼 뷰
  - `desktop-modal-waste-report.png`: 세션 상세 모달 하단 CSV/JSON 리포트 액션바 뷰

---

## 2. 코드베이스 구조 및 변경된 파일 요약

```
apps/api/
  ├── src/modules/agent-registry/
  │   ├── budget.service.ts                     # 리포트 생성 엔진 (JSON/CSV)
  │   ├── budget.service.spec.ts                # 서비스 단위 테스트
  │   ├── agents.controller.ts                  # 엔드포인트 연동 (:id/waste-report.csv, .json)
  │   ├── agent-runs.service.ts                 # abort 로직 제거
  │   └── agents-report.controller.spec.ts      # [NEW] 컨트롤러 헤더/호출 단위 테스트
apps/web/
  ├── src/lib/
  │   ├── exportUtils.ts                        # [NEW] Blob 다운로드 및 Content-Disposition 파싱
  │   └── exportUtils.spec.ts                   # [NEW] 유틸리티 단위 테스트
  ├── src/components/
  │   ├── TokenWasteIntelligenceCard.tsx        # [CSV/JSON] 버튼 및 알림 배너
  │   ├── TokenWasteIntelligenceCard.css        # 버튼 및 알림 배너 스타일링
  │   ├── TokenWasteIntelligenceCard.spec.ts    # 컴포넌트 단위 테스트
  │   ├── SessionWasteModal.tsx                 # [CSV/JSON] 하단 액션바 (Abort 제거 완료)
  │   ├── SessionWasteModal.css                 # 액션바 스타일링
  │   └── SessionWasteModal.spec.ts             # 모달 단위 테스트
  └── src/routes/
      └── ProjectDetailPage.tsx                # projectId 바인딩 (인라인 중단 버튼 제거 완료)
scripts/
  └── qa-server-and-capture.mjs                 # QA 모의 서버 및 29종 스크린샷 캡처
docs/
  ├── kickoff/PROMPT.md                         # 세션 인계 프롬프트 최신화
  ├── kickoff/HANDOVER_20260918.md              # 세션 인계 요약서
  └── HANDOVER.md                               # 본 종합 인수인계 문서
```

---

## 3. 차기 세션 최우선 착수 과제 (사용자 피드백 6종 완벽 반영)

### 🎯 과제명: 토큰 관제 6대 핵심 품질 개선 (차트 금액 바 전환, 프로젝트 틱 격리, 모델명 실측 바인딩, LLM 재시도 복원력, 라이브 틱 안정화, 커밋 기반 목표 갱신 훅)

#### 3.1 사용자 피드백 분석 및 근본 원인 (Root Cause Analysis)

1. **차트 바 그래프 중복 (토큰 vs 금액)**:
   - **현상**: `TokenStockChart.tsx`에서 상단 라인도 토큰이고 하단 바도 토큰이라 둘 다 같은 데이터를 보여주어 정보 가치가 떨어짐.
   - **원인**: `points.map`에서 `barH = p.val > 0 ? Math.max((p.val / maxVal) * barMaxH, 2) : 0;`로 토큰 수치를 그대로 사용함.
   - **해결**: 하단 바를 해당 버킷의 소모 비용(`d.cost`, $ USD)으로 전환하여 주식 차트(상단 주가 + 하단 거래대금/비용 볼륨) 스타일로 직관성을 극대화.

2. **프로젝트 간 라이브 틱 누수 (Leakage across Projects)**:
   - **현상**: Muster에서 에이전트 사용 중 TWshop 프로젝트 페이지로 이동하면 여전히 라이브 틱이 깜빡이며 실행 중으로 뜸.
   - **원인**:
     - `ProjectDetailPage.tsx`에서 URL 파라미터 `id`가 변경되었을 때 `activeAgents`, `agentStartTimes`, `agentHeartbeats`를 리셋하는 클린업 `useEffect` 누락.
     - `useSse.ts`에서도 `projectId` 변경 시 `setEvents([])` 미호출로 이전 프로젝트의 이벤트가 메모리에 유지됨.
   - **해결**: `id` 변경 시 모든 활성 세션 상태 및 SSE 버퍼를 즉각 초기화(flush).

3. **실제 사용 모델명 불일치 (Model Name Drift)**:
   - **현상**: 실제 사용한 모델(예: `claude-3-5-sonnet`, `gemini-2.5-flash`)과 대시보드에 표시되는 모델명이 다름.
   - **원인**:
     - `report-agent-usage.mjs`의 `sumUsageFromTranscript`가 transcript 내 `entry.message.model`을 파싱하지 않고 누락함.
     - DB `agent_runs` 테이블에 `model` 컬럼이 없어 저장되지 않음.
     - `budget.service.ts` line 485에서 `this.modelPricing.resolvePricing(undefined, row.agent_name)`으로 하드코딩 추론(`claude-sonnet-5`, `gemini-3.6-flash`).
   - **해결**: 훅에서 실제 모델명 추출 → API DTO 및 DB `model` 컬럼 추가/영속화 → `budget.service.ts`의 `modelQb`를 `GROUP BY COALESCE(r.model, a.name)`으로 집계하여 실측 모델명 표기.

4. **LLM 호출 간헐적 실패 (Intermittent LLM Errors)**:
   - **현상**: 목표 분석 및 Docker 설정 생성 시 Gemini API 호출 실패(502/503)가 간헐적으로 발생.
   - **원인**: `HttpGeminiClient.ts` 및 `VertexGeminiClient.ts`에 재시도(Retry) 로직이 전무하여 일시적 429(Rate Limit)나 503(Service Unavailable), 네트워크 끊김 발생 시 즉각 에러 폭탄 투하.
   - **해결**: 지수 백오프(Exponential Backoff: 1s, 2s, 4s + Jitter) 기반 3회 자동 재시도 및 30초 타임아웃 적용.

5. **라이브 틱 불안정 (Tick Jitter & Monotonicity)**:
   - **현상**: SSE 수신과 1초 로컬 카운트업 간의 타이밍 차이로 틱 수치가 튀거나 역전되는 현상.
   - **해결**: 틱 단조 증가(`Math.max(prev, next)`) 보장 및 부드러운 애니메이션/보간 처리, 30초 무응답 시 stale 상태 전환.

6. **커밋 기반 자동 목표 갱신 훅 (Commit Hook Goal Progress Analysis)**:
   - **요구**: Git 커밋될 때마다 훅을 통해 목표 설정을 자동 갱신하되, 리소스 소비를 감안해 쿨다운 및 수동 전환 옵션 제공.
   - **해결**: GitHub Webhook `push` 수신 시 비동기로 `analyzeProgress` 트리거하되, 10분 쿨다운 가드를 적용하여 중복 비용 방지. 수동 `[새로 분석]` 버튼 유지.

---

#### 3.2 👥 4인 원팀 확정 설계 명세

- **📌 PM (기획 및 인터페이스 계약)**:
  - **바 차트**: "상단 라인은 토큰 추이, 하단 바는 구간 소모 비용($)"으로 분리하여 데이터 중복 해소.
  - **틱 격리**: 프로젝트 전환 시 이전 프로젝트의 활성 에이전트와 틱이 0.1초 만에 완전히 소멸되어 데이터 오염 방지.
  - **실측 모델**: 대시보드와 최근 세션에 사용자가 프롬프트 실행 시 실제 선택한 모델명(Claude 3.5 Sonnet, Gemini 2.5 Flash 등) 정확히 노출.
  - **LLM 안정성**: 일시적 API 장애 시 3회 무중단 백그라운드 재시도로 99.9% 성공률 달성.
  - **커밋 목표 훅**: Git 푸시 시 백그라운드에서 목표 달성도 자동 재계산 (10분 쿨다운으로 비용 최적화).

- **⚙️ 백엔드 (Backend)**:
  1. `apps/api/src/database/entities/agent-run.entity.ts`:
     - `@Column({ type: 'varchar', length: 100, nullable: true }) model!: string | null;` 추가.
     - 마이그레이션 생성: `ALTER TABLE agent_runs ADD COLUMN model varchar(100) NULL`.
  2. `apps/api/src/modules/agent-registry/dto/*.dto.ts`:
     - `RecordRunByRepoDto`, `CreateAgentRunDto`, `UpdateAgentRunDto`, `HeartbeatDto`에 `model?: string` 추가.
  3. `apps/api/src/modules/agent-registry/agent-runs.service.ts`:
     - 실행 시작 및 하트비트 시 `model` 필드 영속화 및 SSE 이벤트에 `model` 탑재.
  4. `apps/api/src/modules/agent-registry/budget.service.ts`:
     - `modelQb`: `SELECT COALESCE(r.model, a.name) as model_code, a.name as agent_name, ... GROUP BY COALESCE(r.model, a.name), a.name`
     - `model_breakdown`: `this.modelPricing.resolvePricing(row.model_code, row.agent_name)`으로 실측 모델 단가/표시명 바인딩.
     - `recent_runs`: `model: r.model ?? undefined` 반환.
  5. `apps/api/src/common/llm/http-gemini-client.ts` & `vertex-gemini-client.ts`:
     - `executeWithRetry()`: 3회 재시도 (1s, 2s, 4s + Jitter), 429/503/500/네트워크 에러 대응, `AbortSignal.timeout(30000)`.
  6. `apps/api/src/modules/ingest/webhook-ingest.service.ts`:
     - GitHub `push` 이벤트 수신 시 `ProjectGoalsService.analyzeProgress(projectId, userId)` 비동기 호출.
     - 10분 쿨다운 검사: 최근 10분 이내 `based_on_commit_sha`가 일치하거나 분석 이력이 있으면 스킵.

- **🎨 프론트엔드 (Frontend & Hook Scripts)**:
  1. `scripts/claude-code-hooks/report-agent-usage.mjs`:
     - `sumUsageFromTranscript`: `entry.message?.model` 추출하여 반환 객체에 `model` 포함.
     - 세션 시작/하트비트/종료 API 호출 시 `model` 필드 전송.
  2. `scripts/antigravity-hooks/report-agent-usage.mjs`:
     - transcript 또는 SQLite 메타데이터로부터 실측 모델명 추출 및 전송.
  3. `scripts/muster-connect.mjs`:
     - 최신 훅 코드 Base64 임베딩 동기화.
  4. `apps/web/src/components/TokenStockChart.tsx`:
     - 하단 볼륨 바를 비용(`d.cost`, $ USD) 기준으로 스케일링: `costVal = Number(p.d.cost) || 0`, `maxCost = Math.max(...costValues, 0.0001)`, `barH = (costVal / maxCost) * barMaxH`.
     - 툴팁 및 범례에 "선: 토큰 추이 / 막대: 구간 소모 비용 ($)" 명시.
  5. `apps/web/src/routes/ProjectDetailPage.tsx`:
     - `useEffect(() => { setActiveAgents([]); setAgentStartTimes({}); setAgentHeartbeats({}); }, [id]);` 추가 (프로젝트 간 틱 격리).
     - 틱 수치 단조 증가 가드 (`Math.max(prev, next)`).
  6. `apps/web/src/lib/useSse.ts`:
     - `projectId` 변경 시 `setEvents([])` 클린업.

- **🧪 QA (검증 및 시각적 증거)**:
  - 전수 테스트: 신규 마이그레이션 및 재시도 로직 포함 725+개 테스트 100% All Green.
  - 단위 테스트:
    - `TokenStockChart.spec.ts`: 금액 바 렌더링 및 툴팁 검증.
    - `http-gemini-client.spec.ts`: 429/503 시 3회 재시도 복구 검증.
    - `ProjectDetailPage.spec.ts`: 프로젝트 전환 시 틱 격리 검증.
    - `budget.service.spec.ts`: 실측 `model` 컬럼 집계 검증.
  - 빌드 검증: `pnpm -r build` 0 error, 0 warning.
  - 시각적 증거: Chrome CDP 기반 스크린샷 캡처 (금액 바 차트, 실측 모델명 표기, 프로젝트 격리 상태).
  - 지식 그래프: `graphify update .` 최신화 동기화.

---

#### 3.3 차기 세션 원클릭 실행 런북 (Turn-Key Runbook)

```bash
# 1. 브랜치 생성
git checkout main && git pull origin main
git checkout -b feat/token-monitoring-refinement

# 2. 구현 순서
# Step 1: 프로젝트 간 라이브 틱 격리 (ProjectDetailPage.tsx, useSse.ts)
# Step 2: 실측 모델명 추출 및 DB/API 연동 (report-agent-usage.mjs, agent-run.entity.ts, budget.service.ts)
# Step 3: TokenStockChart 하단 바 그래프 금액($) 전환 (TokenStockChart.tsx, TokenStockChart.css)
# Step 4: Gemini LLM 지수 백오프 3회 재시도 복원력 탑재 (http-gemini-client.ts, vertex-gemini-client.ts)
# Step 5: 라이브 틱 안정화 및 단조 증가 보정 (ProjectDetailPage.tsx, burnRate.ts)
# Step 6: Git 커밋 기반 자동 목표 갱신 훅 & 10분 쿨다운 (webhook-ingest.service.ts)

# 3. 테스트 및 빌드 검증
pnpm -r test
pnpm -r build

# 4. QA 스크린샷 캡처
node scripts/qa-server-and-capture.mjs

# 5. 지식 그래프 최신화
graphify update .

# 6. PR 생성, CI 통과 확인, 머지 및 main 동기화
git push origin feat/token-monitoring-refinement
gh pr create --title "feat(monitoring): 토큰 관제 6대 핵심 품질 개선 (차트 금액 바, 틱 격리, 모델명 실측, LLM 재시도, 커밋 목표 훅)" ...
gh pr checks <PR_NO> --watch
gh pr merge <PR_NO> --squash --delete-branch
git checkout main && git pull origin main
```

---

## 4. 인계 시 필수 준수 사항

1. **지식 그래프 선행 조회**: 세션 시작 시 항상 `graphify query "<키워드>"`로 모듈 의존성을 먼저 확인할 것.
2. **세션 내 완결 원칙**: 브랜치 생성부터 구현, 테스트/빌드, QA 스크린샷, PR 머지, `main` 동기화, `PROMPT.md` 갱신까지 한 세션 안에서 끝낼 것.
3. **강제 중단(Abort) 언급 금지**: PR #68에서 완전히 제거되었으므로 해당 기능은 더 이상 건드리지 말 것.
4. **Excel 호환 및 다크 테마 일관성**: CSV는 UTF-8 BOM(`\uFEFF`) 및 RFC 4180을 준수하고, UI는 Emil Kowalski & 다크 글래스모피즘 톤앤매너를 유지할 것.
