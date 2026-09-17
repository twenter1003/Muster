# 에이전트 세션 실시간 중간 토큰(Heartbeat) 스트리밍 연동 & 대시보드 라이브 틱(Tick) 갱신 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대형 에이전트 세션 진행 중 10초 주기 하트비트 토큰을 백엔드로 스트리밍하고 SSE로 대시보드에 라이브 틱(Tick) 증분을 무새로고침으로 반영한다.

**Architecture:** 
- Agent CLI(`muster-connect` 훅)에서 작업 진행 중 중간 토큰을 `PATCH /agent-runs/:id/heartbeat`로 전송
- NestJS 백엔드(`AgentRunsController`/`AgentRunsService`)에서 토큰 갱신 및 `DomainEvent.AGENT_RUN_HEARTBEAT` 발행
- `StreamService`에서 SSE `agent_run_heartbeat` 이벤트로 브로드캐스트
- Web(`useSse`/`ProjectDetailPage`/`TokenStockChart`)에서 실시간 펄스 뱃지 및 카운트업 틱 애니메이션 렌더링

**Tech Stack:** NestJS, TypeORM, RxJS SSE, React 18, TypeScript, Node.js

**Spec:** docs/kickoff/PROMPT.md

---

### Task 1: 백엔드 도메인 이벤트 및 SSE 스트림 서비스 확장 (Domain Event & StreamService)
- Modify: `apps/api/src/common/events/domain-events.ts`
- Modify: `apps/api/src/modules/realtime/stream.service.ts`
- Test: `apps/api/src/modules/realtime/stream.service.spec.ts`

### Task 2: 백엔드 하트비트 DTO, 서비스 메서드 및 API 엔드포인트 구현 (Heartbeat API)
- Create: `apps/api/src/modules/agent-registry/dto/heartbeat-run.dto.ts`
- Modify: `apps/api/src/modules/agent-registry/agent-runs.service.ts`
- Modify: `apps/api/src/modules/agent-registry/agents.controller.ts`
- Test: `apps/api/src/modules/agent-registry/agent-runs.service.spec.ts`

### Task 3: 프론트엔드 SSE 수신 및 대시보드 실시간 라이브 틱 UI 구현 (Web Dashboard)
- Modify: `apps/web/src/lib/useSse.ts`
- Modify: `apps/web/src/routes/ProjectDetailPage.tsx`
- Modify: `apps/web/src/components/TokenStockChart.tsx`
- Modify: `apps/web/src/components/TokenStockChart.css`

### Task 4: muster-connect 및 에이전트 훅 하트비트 연동 (Agent CLI & Hooks)
- Modify: `scripts/muster-connect.mjs`
- Modify: `scripts/claude-code-hooks/report-agent-usage.mjs`
- Modify: `scripts/antigravity-hooks/report-agent-usage.mjs`
- Test: `scripts/muster-connect.test.mjs`

### Task 5: QA 종합 검증 (QA Verification, CDP Screenshots, Documentation)
- Verify `pnpm -r test` and `pnpm -r build`
- Capture visual evidence (CDP screenshots)
- Update `docs/kickoff/PROMPT.md`
