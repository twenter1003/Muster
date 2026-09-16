# 1줄 연동 CLI (`npx muster-connect`) 및 멀티 모델 토큰 관제 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 터미널 1줄 CLI(`npx muster-connect` 또는 `node scripts/muster-connect.mjs`)로 Claude Code 및 Antigravity 세션 토큰을 자동 연동 및 백필하고, 웹 대시보드에서 도구별로 토큰 사용량과 낭비 지표를 분리 조회할 수 있는 체계를 구축한다.

**Architecture:** 외부 의존성 없는(Ponytail) Node.js CLI가 대화형으로 Muster URL, API 키, 연동 대상 도구를 선택받아 에이전트 등록·훅 자동 설정·과거 세션 백필(REST API 통신)을 수행한다. Antigravity는 SQLite 단계별 메타데이터 Protobuf(Tag 9)로부터 정확한 입출력 토큰을 파싱하는 전용 훅을 제공하며, 백엔드 API와 프론트엔드 대시보드는 에이전트별 필터링을 지원한다.

**Tech Stack:** Node.js 20+ (ESM, `node:readline`, `node:fs`, `node:path`), NestJS / TypeORM (PostgreSQL), React (Vite / TypeScript / Vitest / CSS Modules), Jest.

**Spec:** `docs/superpowers/specs/2026-09-17-muster-connect-multi-agent-design.md`

## Global Constraints
- Zero external dependencies for scripts/CLI: `node:*` 내장 모듈과 전역 `fetch`만 사용.
- Non-blocking safe hook execution: 훅 스크립트는 어떤 에러에도 항상 `exit code 0` 반환.
- Minimal & High-polish UI: `emil-design-eng` / `minimalist-ui` 준수, 레이아웃 점프 방지, 즉각적인 반응성.
- TDD 준수: 실패 테스트 작성 -> 검증 -> 최소 구현 -> 통과 -> Conventional Commits.

---

### Task 1: 백엔드 API 확장 - `agent_name` 필터링 및 `CreateRunDto` 백필 지원

**Files:**
- Create: `apps/api/src/modules/agent-registry/dto/create-run.dto.ts`
- Modify: `apps/api/src/modules/agent-registry/budget.service.ts`
- Modify: `apps/api/src/modules/agent-registry/agents.controller.ts`
- Modify: `apps/api/src/modules/agent-registry/agent-runs.service.ts`
- Test: `apps/api/src/modules/agent-registry/budget.service.spec.ts`
- Test: `apps/api/src/modules/agent-registry/agent-runs.service.spec.ts`

**Interfaces:**
- Consumes: `AgentRun`, `Agent`, `ProjectBudget` entities
- Produces:
  - `BudgetService.dailyUsage(projectId: string, agentName?: string): Promise<UsageBreakdown>`
  - `AgentRunsService.start(agentId: string, dto?: CreateRunDto): Promise<AgentRun>`
  - `GET /projects/:id/token-usage?agent_name=`
  - `POST /agents/:id/runs` with optional body `CreateRunDto`

- [x] **Step 1: Write failing unit test for `BudgetService.dailyUsage` with `agentName` filter**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement `agentName` filter in `BudgetService.dailyUsage` and `ProjectAgentsController.getTokenUsage`**
- [x] **Step 4: Write failing unit test for `AgentRunsService.start` with optional `CreateRunDto` (started_at, ended_at, tokens_used, status)**
- [x] **Step 5: Run test to verify it fails**
- [x] **Step 6: Implement `CreateRunDto` and update `AgentRunsService.start` and `AgentsController.startRun`**
- [x] **Step 7: Run all api tests to verify they pass**
- [x] **Step 8: Commit Task 1**

---

### Task 2: 프론트엔드 대시보드 UI 개선 - 에이전트 필터 칩 및 세션별 뱃지

**Files:**
- Modify: `apps/web/src/routes/ProjectDetailPage.tsx`
- Modify: `apps/web/src/styles/components.css` (필요 시 필터 칩 스타일)
- Test: `apps/web/src/routes/ProjectDetailPage.spec.ts` (또는 신규 컴포넌트 단위 테스트 `apps/web/src/lib/agentFilter.spec.ts`)

**Interfaces:**
- Consumes: `UsageBreakdown`, `GET /projects/:id/token-usage?agent_name=`
- Produces: Interactive filter chips `[전체 보기]`, `[Claude Code]`, `[Antigravity]` in `ProjectDetailPage`

- [x] **Step 1: Write failing test for agent filter query and agent badge helper**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Implement filter chip state and agent badge in `ProjectDetailPage.tsx`**
- [x] **Step 4: Apply `emil-design-eng` / `minimalist-ui` styles: 100ms ease-out transitions, clear focus/active states, zero layout shift**
- [x] **Step 5: Run web unit tests to verify they pass**
- [x] **Step 6: Commit Task 2**

---

### Task 3: Antigravity 토큰 수집 훅 스크립트 구축 (`scripts/antigravity-hooks/`)

**Files:**
- Create: `scripts/antigravity-hooks/report-agent-usage.mjs`
- Test: `scripts/antigravity-hooks/report-agent-usage.test.mjs`

**Interfaces:**
- Consumes: Antigravity `Stop` hook payload via stdin (`conversationId`, `workspacePaths`, `transcriptPath`), `~/.gemini/antigravity/conversations/<id>.db`
- Produces: API call to `POST /agents/:id/runs` with accurate token counts and stdout `{}`

- [x] **Step 1: Write failing tests for Protobuf Tag 9 token extraction, transcript fallback, and config resolution**
- [x] **Step 2: Run test (`node --test scripts/antigravity-hooks/report-agent-usage.test.mjs`) to verify it fails**
- [x] **Step 3: Implement `scripts/antigravity-hooks/report-agent-usage.mjs` with safe exit 0 and zero external dependencies**
- [x] **Step 4: Run tests to verify they pass**
- [x] **Step 5: Commit Task 3**

---

### Task 4: 1줄 연동 CLI 도구 구축 (`npx muster-connect` / `scripts/muster-connect.mjs`)

**Files:**
- Create: `scripts/muster-connect.mjs`
- Test: `scripts/muster-connect.test.mjs`
- Modify: `package.json` (`"bin": { "muster-connect": "./scripts/muster-connect.mjs" }`)

**Interfaces:**
- Consumes: User inputs via CLI, Muster REST API, local configs (`~/.claude/settings.json`, `.agents/hooks.json`, `~/.gemini/config/hooks.json`)
- Produces: Fully configured `.muster/config.json`, hooks registered, past sessions backfilled

- [x] **Step 1: Write tests for CLI helper functions (config validation, settings.json updater, hooks.json updater, backfill scanners)**
- [x] **Step 2: Run tests to verify failure**
- [x] **Step 3: Implement `scripts/muster-connect.mjs` with interactive prompt, tool selection, hook installer, and backfill engine**
- [x] **Step 4: Update `package.json` bin mapping**
- [x] **Step 5: Run tests and execute a dry-run test of `node scripts/muster-connect.mjs --help` or automated flags**
- [x] **Step 6: Commit Task 4**

---

### Task 5: 실측 백필 실행, 전체 검증 및 문서화

**Files:**
- Modify: `docs/AGENT_TOKEN_REPORTING.md`
- Modify: `docs/kickoff/PROMPT.md`
- Modify: `docs/DESIGN_DRIFT.md`

- [x] **Step 1: Run Antigravity backfill against the current Muster project to load actual Antigravity session tokens**
- [x] **Step 2: Run full build, test, and lint (`pnpm -r build`, `pnpm -r test`, `pnpm lint`)**
- [x] **Step 3: Update documentation (`AGENT_TOKEN_REPORTING.md`, `DESIGN_DRIFT.md`, `PROMPT.md`)**
- [x] **Step 4: Commit Task 5**
- [x] **Step 5: Push branch `feat/muster-connect-multi-agent` and open PR**
