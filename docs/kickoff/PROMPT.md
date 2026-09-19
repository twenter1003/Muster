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
   - [docs/DESIGN_DRIFT.md](../DESIGN_DRIFT.md) (설계서와 실제가 갈라진 17개 항목 — **최종 진실**)
   - [docs/DEPLOY.md](../DEPLOY.md) (Cloud Run 배포 및 Supabase 함정)
4. **4인 원팀(PM, 백엔드, 프론트엔드, QA) 설계안 제시 및 승인**:
   - 임의로 코딩을 시작하지 않고, PM의 요구사항/API 계약, 백엔드/프론트엔드 구현 범위, QA 검증 계획을 포함한 Bounded/Architectural 설계를 제시하고 **사용자의 명시적 승인 후 구현에 착수**한다.

---

## 프로젝트 개요

Claude Code/LLM 기반으로 여러 사이드 프로젝트를 진행하는 사용자가, GitHub 레포를 연동하면 커밋·배포·로그·에러·LLM 토큰/비용·목표 달성률을 한눈에 관제하는 개인용 대시보드.

- **아키텍처 및 모듈 관계**: 정적 문서를 읽지 말고 **`graphify-out/` 지식 그래프**를 조회할 것.
- **배포 환경**: Cloud Run(`muster`, GCP 프로젝트 `muster-twent`, 리전 `asia-northeast3`, 현재 리비전 `muster-00041-fwc`) + Supabase Postgres.
- **핵심 문서**:
  - `docs/HANDOVER.md` (전체 인수인계 종합 문서)
  - `docs/DESIGN_DRIFT.md` (화면 구조/기능 설계의 최종 진실)
  - `docs/LLM_ECOSYSTEM_GUIDE.md` (2026 최신 모델 라인업, 단가표, 프롬프트 캐싱 할인율)
  - `docs/AGENT_TOKEN_REPORTING.md` (`npx muster-connect` 및 에이전트 훅)
  - `docs/BUG_REPORTS.md` (5분 초고속 장애 진단 런북)

---

## 최근 완료된 것 (최신순, 상세는 git log)

- **토큰 관제 6대 핵심 품질 개선 (PR #69 - d21f88b)**
  - `TokenStockChart`: 하단 바 그래프를 토큰 수가 아닌 해당 구간의 소모 비용(`cost`, $ USD) 기준으로 독립 스케일링, 메트릭 힌트 뱃지(`선: 토큰 추이 · 막대: 구간 비용 ($)`) 추가, 툴팁 내 `전체 토큰`과 `구간 비용` 분리.
  - 라우트 전환 시 격리: `useSse.ts` 및 `ProjectDetailPage.tsx`에서 프로젝트 `id` 변경 시 이전 SSE 이벤트 스트림 및 활성 틱/런 상태 즉시 초기화(flush).
  - 실측 모델명 추출/바인딩: `agent_runs.model` 컬럼 추가 마이그레이션(`1788910000000-AddAgentRunModel`), Claude Code/Antigravity 훅에서 트랜스크립트 실측 모델명 파싱 및 SSE/DB 영속화, `muster-connect.mjs` 동기화.
  - Gemini LLM 장애 복원력: 지수 백오프(1s, 2s, 4s + Jitter) 기반 3회 재시도, 30초 타임아웃, 429/500/502/503/504 및 네트워크 단절 대응 (`apps/api/src/common/llm/retry.ts`).
  - 라이브 틱 단조 증가 보정: `Math.max`를 적용하여 틱 역전 방지 및 `burnRate.ts` 소모 속도 안정화.
  - GitHub push 수신 시 목표 진행률 자동 갱신 훅: `CODE_PUSHED` 도메인 이벤트 비동기 발행 및 10분 쿨다운 가드 적용 (Ingest ↔ ProjectGoals 모듈 디커플링 유지).
  - 테스트: 총 762개 전수 테스트 100% All Green (API 507개, Web 222개, Connect/Hooks 33개).
  - 프로덕션 배포 완료: Supabase 마이그레이션 적용 및 Cloud Run 리비전 `muster-00041-fwc` 배포 완료 (`https://muster-54275961665.asia-northeast3.run.app`, 헬스체크 200 OK).

- **세션 강제 중단(Abort) 기능 제거 및 UI/API 리팩터링 (PR #68 - 03b666b)**
- **에이전트 세션별 토큰/비용 낭비 이력 내보내기(Export) 및 캐싱 절감 ROI 시뮬레이션 리포트 다운로드 구축 (PR #67 - 19cd598)**
- **에이전트 세션별 토큰/비용 낭비 이력 딥다이브 모달 구축 (PR #66)**
- **실시간 토큰 소모 속도(Burn Rate) 추적 및 예산 급증(Budget Spike) 조기 경보 HUD 구축 (PR #65)**

---

## 차기 세션 최우선 착수 과제 (Current Priority Task)

### 🎯 과제명: 프로세스 외부 알림 채널 연동 (Incoming Webhook / Slack / Discord) — DESIGN_DRIFT 10번 & 16번 후속

> **상태 알림**: PR #69 머지 및 Cloud Run 리비전 `muster-00041-fwc` 배포 완료, 전체 762개 테스트 All Green 상태.  
> **다음 세션 에이전트는 사용자와 논의 후 아래 4인 원팀 설계서에 따라 브랜치 생성 및 구현에 착수할 것.**

#### 1. 👥 4인 원팀 추천 설계 명세

- **📌 PM (기획 및 인터페이스 계약)**:
  - **문제 정의**: 현재 `BUDGET_THRESHOLD_EXCEEDED` 및 `BUDGET_SPIKE_CRITICAL` 알림은 대시보드 화면을 열어둔 사용자에게만 SSE로 전달됨. 장시간 백그라운드 작업 중 브라우저를 닫고 있으면 토큰 폭주나 빌드/배포 실패를 제때 인지할 수 없음.
  - **핵심 가치**: 사용자가 슬랙/디스코드/커스텀 웹훅 URL을 등록해 두면, 예산 급증 경보나 배포 실패 시 즉시 외부 메신저로 1건의 깔끔한 카드 메시지가 전송되어 비용 낭비와 장애를 조기에 막음.

- **⚙️ 백엔드 (Backend)**:
  1. `Project` 엔티티 또는 별도 테이블에 `notification_webhook_url` (varchar, nullable) 필드 추가 및 마이그레이션.
  2. 도메인 이벤트 리스너: `DomainEvent.BUDGET_THRESHOLD_EXCEEDED`, `DomainEvent.DEPLOYMENT_STATUS_CHANGED` (status=failure) 구독.
  3. 웹훅 디스패처: 슬랙/디스코드 페이로드 어댑터 및 전송 실패 시 무음 처리(에러 격리) + 5분 쿨다운 가드.

- **🎨 프론트엔드 (Frontend)**:
  1. 프로젝트 상세 화면 헤더 또는 API 키 모달 인근에 `[🔔 알림 설정]` 진입점 제공.
  2. Slack/Discord/Webhook URL 입력 폼 및 [테스트 발송] 버튼 제공.
  3. 경보 발생 시 웹훅 발송 완료 피드백 배너 노출.

- **🧪 QA (검증 및 시각적 증거)**:
  1. 모의 웹훅 수신 서버(Node http)를 이용한 발송 단위/통합 테스트 작성.
  2. 762+개 기존 테스트 All Green 유지 및 `pnpm -r build` 통과.
  3. Chrome CDP 스크린샷 캡처 및 `graphify update .` 실행.

---

## 작업 관례 (사용자 필수 지침)

- **4인 팀(PM, 백엔드, 프론트엔드, QA) 원팀 협업**:
  - "항상 프론트, 백엔드, QA, PM 넷이서 한 팀으로 서로 소통하면서 움직여야 돼"
  - PM의 계약 하에 백엔드와 프론트엔드가 소통하고, QA가 실측과 시각적 증거(스크린샷)로 검증한다.
- **세션 내 완결 원칙**:
  - 테스트·빌드 검증 → 새 브랜치 커밋 → 푸시 → PR 생성 → CI 통과 확인 → 머지 → 프로덕션 배포 → 로컬 main 동기화까지 한 세션 안에서 완료한다.
- **프론트엔드 시각적 증거(스크린샷) 필수**:
  - UI 수정 시 반드시 실제 렌더링된 화면 스크린샷(데스크톱 및 모바일 반응형)을 사용자에게 제시한다.
- **코드 수정 후 graphify 갱신**:
  - 주요 기능 완료 후 `graphify update .`를 실행하여 지식 그래프를 동기화한다.
- **세션 종료 전 PROMPT.md 갱신**:
  - 세션을 넘길 때 완료 내역과 다음 과제를 반영해 이 문서를 최신화한다.
- **커밋 메시지**: Conventional Commits 스타일, 본문에 "왜"를 적고 자신의 모델명을 기재한다.
