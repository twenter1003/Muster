# 1줄 연동 CLI (`npx muster-connect`) 및 멀티 모델(Claude / Antigravity) 토큰 관제 설계서

- **작성일**: 2026-09-17
- **브랜치**: `feat/muster-connect-multi-agent`
- **상태**: 승인 대기 / 구현 계획 수립 단계

---

## 1. 배경 및 목적

Muster는 개인용 사이드 프로젝트 관리 플랫폼으로, GitHub 커밋·배포·에러 로그와 더불어 외부 AI 코딩 에이전트의 토큰 사용량과 낭비(컨텍스트 팽창)를 관제한다.
기존 시스템은 Claude Code의 `SessionStart`/`SessionEnd` 훅 기반 실측 연동과 과거 세션 백필(PR #44)을 도입했으나 다음과 같은 한계가 있었다:
1. **타 환경 온보딩 복잡성**: 신규 머신이나 외부 개발자가 세션 토큰 연동을 하려면 문서를 보고 직접 스크립트 복사, `settings.json` 편집, API 키 발급/설정을 수동으로 해야 함.
2. **단일 모델(Claude Code) 종속성**: Antigravity(Gemini CLI) 등 다른 주요 AI 에이전트를 함께 사용하거나, 반대로 특정 회사의 도구만 사용하는 개발자 환경을 지원하지 못함.
3. **대시보드 필터 부재**: 프로젝트 상세 화면의 "에이전트 토큰 관제" 카드가 모든 에이전트 실행을 하나로 묶어 보여주어, 사용자가 각 도구별(Claude vs Antigravity) 사용량 및 낭비 지표를 분리해서 파악할 수 없음.

본 작업은 터미널 1줄(`npx muster-connect` 또는 `node scripts/muster-connect.mjs`)로 원하는 도구를 선택해 자동 훅 등록 및 과거 세션 백필을 끝내고, 웹 대시보드에서 도구별로 깔끔하게 필터링할 수 있는 완전한 멀티 에이전트 토큰 관제 체계를 구축한다.

---

## 2. 설계 원칙

1. **Ponytail 원칙 (Zero External Dependencies on CLI/Scripts)**:
   - `muster-connect` CLI와 훅 스크립트는 무거운 npm 패키지(inquirer, axios 등)를 일체 사용하지 않고 Node.js 내장 모듈(`node:readline`, `node:fs`, `node:os`, `node:path`, `fetch`)만으로 구현한다.
2. **REST API 중심 & 로컬 DB 폴백**:
   - 외부 개발자는 Supabase Postgres DB 접속 권한(`DATABASE_URL`)이 없으며 오직 Muster 서비스 URL과 API Key만 가진다.
   - 따라서 에이전트 등록, 실행 기록, 백필 전송 모두 Muster HTTP REST API(`POST /agents/:id/runs` 등)를 기본 통신 채널로 사용한다. (로컬 개발 환경에서 `DATABASE_URL`이 있으면 직접 DB 벌크 인서트도 옵션으로 지원).
3. **Non-blocking Safe Hook Execution**:
   - 훅 스크립트는 네트워크 오류, 설정 누락, 타임아웃 등 어떤 상황에서도 항상 `exit code 0`으로 끝나며 에이전트 본래 세션 동작을 방해하지 않는다.
4. **미니멀 & 반응성 높은 UI (`emil-design-eng` + `minimalist-ui`)**:
   - Muster의 모노크롬 미니멀 스타일에 맞춰 절제된 필터 칩(전체 / Claude Code / Antigravity)을 제공하며, 즉각적인 반응성(Zero-latency interaction)을 보장한다.

---

## 3. 세부 아키텍처 및 변경 컴포넌트

### 3.1. 1줄 연동 CLI (`scripts/muster-connect.mjs` 및 `package.json bin`)

- **실행 명령**:
  - 로컬/레포: `node scripts/muster-connect.mjs`
  - 전역/외부: `npx muster-connect` (또는 `pnpm muster-connect`)
- **대화형 설정 플로우 (`readline/promises`)**:
  1. **Muster 서비스 URL 확인**:
     - 기본값: `https://muster-xcswvn6m2q-du.a.run.app`
     - 사용자가 엔터 입력 시 기본값 채택, 직접 입력 시 해당 URL 사용.
  2. **API Key 및 Project ID 확인**:
     - 현재 디렉터리(`.muster/config.json`) 또는 환경변수(`MUSTER_API_KEY`, `MUSTER_PROJECT_ID`)가 있으면 기존 값 제시 및 재사용 여부 확인.
     - 없거나 변경 시 사용자 입력 수신.
     - 입력받은 API Key로 API 서버 상태 및 프로젝트/에이전트 목록 확인 (`GET /projects/:id/agents` 또는 `GET /agents`).
  3. **연동 대상 도구 선택**:
     - 안내: `[1] Claude Code`, `[2] Antigravity`, `[3] 둘 다 (기본값)`
     - 사용자가 엔터 입력 시 `[3]` 채택.
     - 선택되지 않은 도구의 훅 등록 및 백필은 일체 건너뜀.
  4. **에이전트 매핑 및 `.muster/config.json` 저장**:
     - 선택된 도구에 맞춰 `claude-code`, `antigravity` 에이전트가 프로젝트에 없으면 자동 생성(`POST /projects/:id/agents`).
     - 레포 루트 `.muster/config.json` 생성/갱신:
       ```json
       {
         "apiUrl": "https://muster-xcswvn6m2q-du.a.run.app",
         "apiKey": "muster_...",
         "projectId": "<projectId>",
         "agents": {
           "claude-code": "<claudeAgentId>",
           "antigravity": "<antigravityAgentId>"
         },
         "agentId": "<claudeAgentId>"
       }
       ```
     - `.gitignore`에 `.muster/`가 없으면 자동 추가.
  5. **도구별 훅 자동 등록**:
     - **Claude Code**:
       - `~/.claude/settings.json` 파싱 후 `hooks.SessionStart` 및 `hooks.SessionEnd`에 Muster 리포터(`scripts/claude-code-hooks/report-agent-usage.mjs` 절대경로) 등록.
     - **Antigravity**:
       - `.agents/hooks.json` 및 `~/.gemini/config/hooks.json` 파싱 후 `Stop` 이벤트에 Muster Antigravity 리포터(`scripts/antigravity-hooks/report-agent-usage.mjs` 절대경로) 등록.
  6. **과거 세션 백필(Backfill)**:
     - 사용자에게 "과거 세션 이력을 Muster에 지금 백필하시겠습니까? (Y/n)" 확인.
     - Claude Code 선택 시: `~/.claude/projects/`에서 해당 프로젝트 디렉터리 스캔 -> `.jsonl` 세션 파싱 -> Muster API로 적재.
     - Antigravity 선택 시: `~/.gemini/antigravity/conversations/*.db` 및 `brain/` 스캔 -> 해당 프로젝트 워크스페이스 세션 매칭 -> SQLite Step Protobuf Tag 9에서 정확한 입력/출력 토큰 추출 -> Muster API로 적재.
     - 백필 완료 요약(총 세션 수, 누적 백필 토큰 수) 출력.

---

### 3.2. Antigravity 리포터 스크립트 (`scripts/antigravity-hooks/report-agent-usage.mjs`)

- **트리거**: Antigravity 세션 완료 시 `Stop` 이벤트.
- **입력 (stdin)**:
  ```json
  {
    "conversationId": "uuid",
    "workspacePaths": ["/Users/.../Muster"],
    "transcriptPath": "...",
    "modelName": "auto",
    "terminationReason": "model_stop"
  }
  ```
- **동작**:
  1. `workspacePaths[0]` 또는 CWD에서 `.muster/config.json` 로드.
     - 없으면 아무 작업도 하지 않고 `{}` 출력 후 `exit 0`.
  2. `config.agents?.antigravity` 에이전트 ID 획득.
  3. 세션 토큰 집계:
     - 1순위: `~/.gemini/antigravity/conversations/${conversationId}.db` 연결 -> `steps` 테이블의 `metadata` blob에서 Tag 9 (`sub[2]`: input tokens, `sub[3]`: output tokens) 합산.
     - 2순위 (DB 불가 시 폴백): `transcriptPath` JSONL 라인 스캔하여 문자열 기반 추정.
  4. Muster API 보고:
     - `POST /agents/${agentId}/runs` 호출하여 시작 기록 생성 (또는 단일 완료 전송).
     - `PATCH /agent-runs/${runId}`로 토큰 수 및 `status: 'succeeded'` 갱신.
  5. stdout으로 `{}` 출력 후 종료.
  6. 에러 발생 시 stderr에만 남기고 항상 `process.exit(0)`.

---

### 3.3. 백엔드 API 확장 (`apps/api`)

#### (1) `GET /projects/:id/token-usage`에 `agent_name` 쿼리 파라미터 추가
- **요청**: `GET /projects/:id/token-usage?agent_name=claude-code` 또는 `?agent_name=antigravity` (생략 시 전체).
- **서비스 변경 (`BudgetService.dailyUsage`)**:
  - `agentName`이 주어지면 `daily`, `month_tokens`, `total_tokens`, `recent_runs` 쿼리에 `andWhere('a.name = :agentName', { agentName })` 조건 바인딩.
  - `computeWasteInsight(recentRuns)`도 해당 에이전트의 런 목록을 바탕으로 정확히 산출.
  - `agentName`이 없거나 `all`인 경우 기존처럼 프로젝트 전체 에이전트 대상 집계.

#### (2) `POST /agents/:id/runs`의 백필/즉시 생성 지원
- **요청 본문 (`CreateRunDto`)**:
  - `status?: AgentRunStatus` (기본값: `'running'`)
  - `tokens_used?: number` (기본값: `0`)
  - `cost?: string` (기본값: `'0'`)
  - `started_at?: string` (기본값: 현재 시각)
  - `ended_at?: string` (선택)
- **효과**: 외부 개발자가 백필 스크립트를 돌릴 때, 과거 세션의 시작/종료 시각과 토큰 사용량을 단 한 번의 REST API 호출로 안전하게 기록할 수 있음.

---

### 3.4. 프론트엔드 대시보드 UI 개선 (`apps/web`)

- **대상 컴포넌트**: `apps/web/src/routes/ProjectDetailPage.tsx`의 "에이전트 토큰 관제" 카드
- **UI 구성**:
  - 패널 헤더 우측에 미니멀 필터 칩(Filter Group) 배치:
    - `[전체 보기]` (기본값)
    - `[Claude Code]`
    - `[Antigravity]`
  - 필터 상태 `selectedAgent` (`'all'` | `'claude-code'` | `'antigravity'`)에 따라:
    - API URL: `/projects/${id}/token-usage${selectedAgent !== 'all' ? `?agent_name=${selectedAgent}` : ''}`
    - 월간/총 사용량, 스파크라인 그래프, 낭비 분석 알림, 최근 세션 이력이 해당 에이전트 기준으로 즉시 전환됨.
  - 최근 세션 목록에 에이전트 식별 태그 추가:
    - Claude Code 세션: `claude-code` 뱃지
    - Antigravity 세션: `antigravity` 뱃지
  - `emil-design-eng` / `minimalist-ui` 가이드 적용:
    - 칩 토글 시 레이아웃 덜컥거림(Layout Shift) 방지
    - 클릭 시 즉각적인 테두리/배경색 트랜지션 (100ms ease-out)

---

## 4. 검증 계획 (Verification Plan)

1. **단위 테스트**:
   - `apps/api`:
     - `BudgetService.dailyUsage`: `agent_name` 필터링 단위 테스트 추가 (`claude-code`, `antigravity`, `all`).
     - `AgentsController.startRun`: `CreateRunDto`로 과거 세션 생성 검증.
   - `apps/web`:
     - 필터 칩 토글에 따른 API URL 쿼리 파라미터 매핑 테스트.
     - 도구별 뱃지 렌더링 테스트.
   - `scripts`:
     - Antigravity 토큰 파서 단위 테스트 (`scripts/antigravity-hooks/report-agent-usage.test.mjs`).
     - Claude Code 토큰 파서 회귀 테스트 (`scripts/claude-code-hooks/report-agent-usage.test.mjs`).
2. **통합/E2E 검증**:
   - `node scripts/muster-connect.mjs` dry-run 및 실제 실행 검증.
   - 실제 Antigravity 이전 세션 백필 실행 후 DB 반영 수치 확인.
   - `pnpm -r test` 및 `pnpm -r build`, `pnpm lint` 통과 확인.
