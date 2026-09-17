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

- **TokenStockChart 마우스 호버 인터랙티브 플로팅 툴팁(Floating Tooltip) 및 다중 에이전트 수치 인포박스 구축**
  - 마우스/터치 호버 시 크로스헤어와 연동되는 2026 다크 글래스모피즘 플로팅 툴팁(`[data-testid="chart-floating-tooltip"]`) 구현.
  - 지능형 스마트 플립(Smart Flip & Clamping): 차트 우측에서는 좌측으로, 좌측에서는 우측으로 자동 전환 및 Y축 클램핑으로 뷰포트 경계 이탈 방지.
  - 단일 뷰(전체 토큰, 비용, 라이브 틱) 및 에이전트 비교 뷰(에이전트별 테마 컬러 도트, 라벨, 토큰량, 비용, 점유율 %) 완벽 지원.
  - `TokenStockChart.spec.ts` 단위 테스트 4종 추가 (총 679개 유닛 테스트 100% 통과).
  - Chrome CDP 기반 22종 스크린샷 캡처(데스크톱/모바일 플로팅 툴팁 뷰) 시각적 검증 완료.
  - `graphify update .`를 통한 지식 그래프(3,144개 노드, 7,596개 엣지) 최신화 동기화 완료.
- **프로젝트 상세 에이전트별(Claude Code vs Antigravity/Gemini vs Cursor) 토큰 사용량 비교 필터링 및 TokenStockChart 오버레이 강화**
  - 백엔드 `dailyUsage` 복수 에이전트 필터(`a.name IN (...)`) 지원 및 `agent_series`, `available_agents`, 버킷별 `agent_tokens`/`agent_cost` 단일 집계 쿼리 최적화 (`budget.service.ts`).
  - 프론트엔드 `agentFilter.ts` 내 `Cursor` 에이전트 추가, 다중 에이전트 파라미터 직렬화, `AGENT_THEMES` 컬러 매핑 구축.
  - `TokenStockChart.tsx`: `📊 에이전트 비교` 멀티라인 SVG 오버레이, 인터랙티브 On/Off 범례(Legend), 에이전트별 크로스헤어 도트, 하단 실시간 비용 서브 HUD 칩 탑재.
  - `ProjectDetailPage.tsx`: `[Cursor]` 필터 칩 추가 및 차트 오버레이 연동.
  - 테스트: API 480개 + Web 182개 + muster-connect 13개 등 총 675개 유닛 테스트 All Green.
  - Chrome CDP 20종 스크린샷 캡처(데스크톱/모바일 비교 오버레이 뷰, Cursor 필터 뷰 포함) 시각적 검증 완료.
  - `graphify update .`를 통한 지식 그래프 최신화 동기화 완료 (3,142 노드, 7,596 엣지).
- **에이전트 토큰 낭비 인텔리전스 및 2026 프롬프트 캐싱(Prompt Caching) 최적화 가이드 대시보드 구축**
  - 최신 2026 프론티어 모델(Claude Sonnet 5, Gemini 3.8/3.6 Flash, GPT-5.6 Terra 등)의 90% 캐시 읽기 할인 시뮬레이션 엔진 및 `computeTokenWasteIntelligence` 도메인 수식 구현.
  - `GET /projects/:id/token-waste-intelligence` API 및 `budget.service.ts` 확장.
  - 웹 대시보드 `TokenWasteIntelligenceCard` 컴포넌트(절감 잠재액 HUD, 캐시 적중률 프로그레스 바, 팽창 토큰 진단, 2026 모델 단가 칩, 3대 최적화 실천 가이드 모달) 탑재.
  - API 유닛 478개 / Web 175개 / muster-connect 13개 등 총 666개 유닛 테스트 All Green.
  - Chrome CDP 데스크톱/모바일 17종 스크린샷 시각적 검증 완료.
  - `graphify update .`를 통한 코드베이스 지식 그래프(3,136개 노드, 7,587개 엣지) 최신화 동기화 완료.
- **에이전트 세션 실시간 중간 토큰(Heartbeat) 스트리밍 연동 & 대시보드 라이브 틱(Tick) 갱신 (Cloud Run 배포 완료)**
- **코드베이스 전체 지식 그래프(Knowledge Graph) 구축 (`/graphify .`)**

---

## 차기 세션 최우선 착수 과제 (Current Priority Task)

### 🚨 에이전트별 실시간 토큰 소모 속도(Burn Rate, tokens/min) 추적 및 예산 급증(Budget Spike) 조기 경보 HUD 구축

**배경 & 필요성**:
- 에이전트가 긴 루프에 빠지거나 대용량 파일을 반복 읽을 때 토큰과 비용이 비정상적으로 급증하는 문제를 조기에 감지할 필요성.
- 최근 5분/15분 단위의 Burn Rate(분당 토큰 및 비용 소모 속도)를 계산하여 비정상 스파이크 감지 시 시각적 경보(Badge/Alert)와 권장 중단 조치를 실시간으로 제안.

**4인 원팀 협업 계획**:
1. **PM (오케스트레이터)**: Burn Rate 임계치(예: >50k tokens/min) 기준 수립 및 조기 경보 배지/토스트 UX 명세 정의.
2. **백엔드 (Backend)**: `budget.service.ts`에 최근 시간 윈도우 기반 실시간 burn rate 계산 및 스파이크 탐지 엔드포인트/필드 추가.
3. **프론트엔드 (Frontend)**: `TokenStockChart` 및 프로젝트 상단 HUD에 실시간 Burn Rate 게이지 및 급증 경보 배지 연동.
4. **QA (품질 검증)**: 유닛 테스트 추가, 모의 부하 시나리오 스크린샷 캡처 및 `graphify update .` 수행.

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
