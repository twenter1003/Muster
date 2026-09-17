# Muster 개발 인계 프롬프트

이 문서는 Claude(Claude Code)가 작업하던 Muster 프로젝트를 다른 에이전트(예: Antigravity의
Gemini)에게 넘길 때 그대로 붙여 넣는 킥오프 프롬프트다. **최신 상태를 반영해야 의미가
있다** — 이전 에이전트가 세션을 넘기기 직전에 이 문서를 다시 생성해서 갱신할 것. 오래된
채로 넘기면 이미 끝난 일을 다시 하거나, 이미 뒤집힌 결정을 원래대로 되돌리게 된다.

---

## 너에게 요청하는 것

너는 지금부터 Muster라는 개인용 프로젝트 관리 플랫폼의 개발을 이어받는다. 아래 내용을
읽고, 레포(`twenter1003/Muster`, 현재 디렉터리)의 실제 코드와 `git log`를 직접 확인한
뒤 — **이 문서를 무조건 믿지 말고, 코드가 실제로 그런지 검증하고 시작할 것.** 특히
"알려진 백로그" 항목은 이 문서를 쓴 시점 이후 이미 해결됐을 수 있다.

작업 방식은 아래 "작업 관례" 절을 따른다. 사용자(twenter1003)는 한국어로 대화하고,
직접적이고 간결한 답을 선호한다.

## 프로젝트가 뭔가

Claude Code/LLM 기반으로 여러 사이드 프로젝트를 동시에 진행하는 사용자가, GitHub 레포를
가져오면 커밋·배포·에러 로그·Claude 토큰 사용량·목표 대비 진행률을 한 화면에서 보는
개인용 모니터링 도구. 여러 프로젝트를 흩어진 채로 관리하는 비용을 줄이는 게 목적이다.

**요구사항 원천**: `Muster_통합설계서_v2.1.md`(레포 루트) — 다만 아래 "설계서와 실제가
갈라진 지점" 절 없이 이 문서만 읽으면 지금 화면 구조와 다르다. 설계서는 최초 기획이고,
실사용 피드백으로 크게 재설계됐다. **`docs/DESIGN_DRIFT.md`가 최종 진실이다** — 문서
내부 충돌 시 `DESIGN_DRIFT.md` > 설계서.

## 먼저 읽을 순서

1. [README.md](../../README.md) — 폴더 구조, 로컬 실행, 테스트, 마이그레이션, 배포 제약
2. [docs/DESIGN_DRIFT.md](../DESIGN_DRIFT.md) — 설계서에서 갈라진 모든 지점과 그 이유.
   **가장 중요한 문서.** 14개 항목, 번호 순서대로 시간순이다.
3. [docs/DEPLOY.md](../DEPLOY.md) — 배포 절차, Supabase/Cloud Run 함정
4. [docs/BUG_REPORTS.md](../BUG_REPORTS.md) — 버그 리포트 템플릿, 5분 초고속 장애 진단 런북 및 해결 사례 아카이브
5. [docs/AGENT_TOKEN_REPORTING.md](../AGENT_TOKEN_REPORTING.md) — 토큰 사용량 자동 리포팅
   (Claude Code & Antigravity 훅, 1줄 연동 CLI `npx muster-connect`)
6. [docs/LLM_ECOSYSTEM_GUIDE.md](../LLM_ECOSYSTEM_GUIDE.md) — 2026 최신 LLM 모델(Gemini 3.x,
   Claude Fable 5.1 / Opus 5 / Sonnet 5, GPT-5.6/6 등) 라인업, 단가표, 프롬프트 캐싱 및 Muster 권장사항

## 지금 상태 (이 문서를 쓴 시점 기준)

- **IA**: 로그인 → 레포 가져오기(`/import`) → 프로젝트 목록(`/`) → 프로젝트 상세
  (`/projects/:id`). 고정 사이드바 없음. DocStore·EnvCatalog·AgentRegistry·로그·헬스·
  리포트·감사 로그·Inbox·설정 화면은 **라우트만 제거, 파일은 보존** — 다시 필요해지면
  라우트 한 줄만 되살리면 된다(DESIGN_DRIFT §11).
- **배포됨**: Cloud Run(`muster` 서비스, GCP 프로젝트 `muster-twent`, 리전
  `asia-northeast3`) + Supabase 무료 Postgres. 현재 서비스 주소는
  `gcloud run services describe muster --region asia-northeast3 --format='value(status.url)'`
  로 직접 확인할 것 — **Cloud Run 기본 URL이 배포 중에 바뀐 적이 있다**(숫자 기반 →
  해시 기반). GitHub OAuth 콜백은 항상 그 시점의 현재 URL을 따라간다.
- **테스트**: `pnpm -r build`, `pnpm -r test`(api 유닛 472 / web 170),
  `pnpm --filter @muster/api test:e2e`(246+, 로컬 DB 필요). 전부 통과하는 게 기본 전제 —
  실패한 채로 커밋하지 않는다.
- **최근 완료된 것** (최신순, 상세는 git log):
  - **주식 차트형 다차원 토큰 모니터링 (월/일/시간) & 모델별 토큰·비용 브레이크다운 구현 및 Cloud Run 실서버 배포 완료** (주식 창(TradingView/Upbit) 스타일의 인터랙티브 SVG 토큰 사용량 차트(`TokenStockChart`), 세그먼트 스위처 3버튼(`[시간별(24h)]`/`[일간(14d)]`/`[월간(6m)]`), Area fill + Line stroke + Volume bar + 크로스헤어 HUD 툴팁, 모델별 점유율 및 누적 토큰/비용 브레이크다운 카드(`ModelUsageBreakdown`), Anthropic/Google/OpenAI/DeepSeek 컬러 뱃지 및 프로그레스 바, 백엔드 `GET /projects/:id/token-usage?granularity=hour|day|month` 타임존 버킷팅 및 `ModelPricingService` 기반 무마이그레이션 안전 산출, 하위 호환성 100% 보장, API 유닛 472개 / Web 유닛 170개 전원 통과, Chrome CDP 데스크톱/모바일 12종 시각적 증거 확보, PR #60, 커밋 `163289e`, Cloud Run `muster-00037-9dt`)
  - **대용량 목표 체크리스트 UX 전면 개선 (미니 요약 HUD + 전용 슬라이드 드로어 및 모바일 바텀시트 탑재) 및 Cloud Run 실서버 배포 완료** (체크리스트가 수십 개로 늘어나도 대시보드 목표 카드 높이를 ~200px로 고정하여 하단 최근 커밋/배포/로그 관제 패널의 접근성을 완벽 보장, 미완료 우선순위 Top 3 'Up Next' 인라인 체크박스 제공, 네이티브 `<dialog>` 기반 우측 슬라이드 드로어(460px) 및 모바일 85vh 바텀시트, 실시간 키워드 검색·상태 필터 칩(`[전체]`/`[대기]`/`[완료]`)·완료 숨기기 토글·마크다운 헤더 마일스톤 아코디언 탑재, 단위 테스트 12개 추가 및 웹 테스트 161개 전원 통과, PR #59, 커밋 `91ef4ee`, Cloud Run `muster-00036-6qd`)
  - **버그 리포트 템플릿, 5분 초고속 장애 진단 런북 및 원클릭 진단 스크립트(`scripts/diagnose-live.sh`) 구축** (실서버 500 에러 및 UI 결함 발생 시 5초 만에 원인을 규명하고 즉각 핫픽스하기 위한 표준 진단 프로토콜, GitHub Issue 버그 템플릿(`.github/ISSUE_TEMPLATE/bug_report.md`), 실제 발생 버그 4종 상세 RCA 아카이브(`docs/BUG_REPORTS.md`), Cloud Run 활성 리비전/헬스/보안가드/에러로그 자동 점검 CLI 구축)
  - **프로젝트 목록 요약 쿼리 PostgreSQL `DISTINCT ON` 문법 에러 해결 및 Cloud Run 실서버 배포 완료** (TypeORM의 `select('DISTINCT ON ...')` 사용 시 컬럼 순서 재배치로 인해 Postgres 구문 오류(`syntax error at or near DISTINCT`)가 발생하여 실서버 대시보드 진입 시 500 에러를 반환하던 문제를 전용 메서드인 `.distinctOn(['alias.project_id'])`로 전면 교체하여 해결, TypeORM Mock QB에 `distinctOn` 추가, API 단위 테스트 469개 전원 통과, 실서버 `GET /api/v1/projects?summary=true` 200 OK 검증 완료, PR #57, 커밋 `7a717a6`, Cloud Run `muster-00035-rzz`)
  - **모바일 뷰포트 레이아웃 잘림 해결 및 QA CDP 캡처 고도화, Cloud Run 실서버 배포 완료** (Chrome DevTools Protocol 기반 실기기 390x844 뷰포트 에뮬레이션 캡처로 전환하여 헤드리스 창 500px 제한으로 인한 캡처 크롭 결함 원천 해결, 미인증 401 분기 처리로 진짜 로그인 화면 캡처, BenchmarkHud 767px 미디어 쿼리 확대 및 버튼 텍스트 말줄임, ProjectDetailPage 640px 이하 액션 버튼 3종 1열 풀위드 정렬, ProjectListPage 필터 칩 flex-wrap 줄바꿈 및 카드 푸터 모바일 컬럼 레이아웃 적용, PR #56, 커밋 `d4047cd`, Cloud Run `muster-00034-8bt`)
  - **프로젝트 목록 N+1 해소 고속 요약 API (`GET /projects?summary=true`), 실시간 A/B 벤치마크 HUD, 대시보드 UX/UI 고도화 및 로그인 가속화** (10개 프로젝트 기준 41회 개별 HTTP 요청을 단 1회로 통합(97.6% 감축, 66배 고속화, 슬롯 깜빡임 0회 제로 레이아웃 시프트), A/B 테스트 원클릭 실시간 전환 HUD(`BenchmarkHud`, 모바일 캡슐 모드 지원), 스마트 검색·상태 필터 칩·정렬 드롭다운·GitHub/API 키 퀵 액션, 프로젝트 상세 1-클릭 전체 동기화 및 퀵 스위처·에이전트 경과시간 타이머, SessionService 60초 TTL 인메모리 캐시로 매 요청 DB 조인 부하 제거 및 OAuth 병렬화 로그인 가속, PR #55, 커밋 `b52d99e`)
  - **전 모바일 기기(360px~480px, 980px 모바일 데스크톱 모드, 폴더블, 태블릿) 완벽 반응형 대응** (반응형 분기점을 1100px로 상향하여 모바일 데스크톱 모드(980px) 및 태블릿에서도 2열 찌그러짐 없는 100% 단일 칼럼 통일, `index.html` W3C 표준 뷰포트 `width=device-width, initial-scale=1.0` 전환, 1024px 이하 상단바 검색·경로 숨김으로 오버플로 원천 방지, 토큰 관제 카드 전폭 터치 버튼 및 3분할 칩 필터 적용, 전역 `overflow-x: hidden` 및 `100dvh` 적용, 커밋 `5f3c955`, Cloud Run `muster-00033-vv9`)
  - 모바일 반응형 레이아웃 깨짐 전면 개선 및 실시간 대시보드 UI 컬러 팔레트 통일 (뷰포트 줌아웃 방지 메타 적용, 상단바/헤더/목록/세션 행 모바일 완벽 1열 및 줄바꿈 최적화, 에메랄드 그린 비용($) 텍스트 및 블루 API 키 관리 버튼, 상태별 뱃지 컬러 일치화, 커밋 `3e7f2b9`)
  - GitHub Actions CI 정적 분석 실패 해결 및 포맷팅 자동 교정 (Prettier / ESLint 규칙 불일치 자동 정렬 및 CI 100% 그린 패스 달성, 커밋 `59e2378`)
  - SSE 기반 실시간 에이전트 세션 관제 및 대시보드 무새로고침 자동 갱신 (Running 세션 점멸 라이브 뱃지, EventSource 기반 실시간 도메인 이벤트 수신, 세션 종료 시 토큰·비용·상태 실시간 리로드, 커밋 `7b94f1f`)
  - 2026 프론티어 LLM 단가 엔진 구축 및 대시보드 실시간 비용($) 산출 (Claude Fable 5.1/Opus 5/Sonnet 5, Gemini 3.x, GPT-6/5.6, DeepSeek 단가표 매핑, ModelPricingService 및 세션·프로젝트·일별 비용($) 동시 표기, 커밋 `dc4709e`)
  - 무설치 1줄 연동 (`curl -fsSL .../connect.mjs | node -`) 및 ApiKeyModal 연동 가이드 개편 (템플릿 Base64 내장, 백엔드 connect.mjs 직접 서빙, 커밋 `1148025`)
  - 프로젝트 상세 화면(`ProjectDetailPage`) API 키 관리 모달(`ApiKeyModal`) 복원 및 모바일 최적화 (상단 탑로우, 헤더 링크, 에이전트 토큰 관제 패널에 연동 진입점 추가, PR #52, #53, Cloud Run 배포 완료)
  - Git remote 기반 에이전트 토큰 자동 라우팅 및 맥북 전역 1회 연동 지원 (`POST /agent-runs/by-repo`, `scripts/muster-connect.mjs --global`, PR #52)
  - Muster 프로젝트 Antigravity 실측 토큰 연동 및 백필 완료 (Muster 프로젝트 API 키 발급, `antigravity` 에이전트 생성, 로컬 2개 세션 총 1,467만 토큰 백필 적재, `~/.gemini/config/hooks.json` 및 `.muster/config.json` 연동 완료)
  - 세션 작업 프로세스 최적화 룰 수립 (단순 문서/오타 수정은 세션 종료 시점에 일괄 처리하여 불필요한 CI 대기 방지, 복합 프롬프트는 서브에이전트 병렬 실행, PR #51)
  - 2026 최신 LLM 생태계 가이드 구축 (Gemini 3.x, Claude Fable 5.1 / Opus 5 / Sonnet 5, GPT-6 Astra, DeepSeek 라인업 및 1M 토큰당 단가표·캐싱 공식 정리, PR #48, #49)

  - 1줄 연동 CLI (`npx muster-connect`) 및 멀티 모델(Claude / Antigravity) 토큰 관제 (외부 의존성 제로 Ponytail 원칙 CLI, SQLite metadata Protobuf 디코더 기반 Antigravity 세션 토큰 실측 훅, 백엔드 agent_name 필터링 및 CreateRunDto 백필 지원, 웹 대시보드 무지연 필터 칩 및 세션 뱃지 UI, PR #46)
  - 목표 달성률의 마일스톤 체크리스트화 및 결정론적 진행률 산출 (문제점 1&2 해결: Markdown Task List 기반 파싱, Gemini는 커밋 증거 매칭만 수행, 진행률을 (완료/전체)*100% 수학적 결정론으로 고정, 웹 체크리스트 인터랙티브 토글, PR #45)
  - 에이전트 토큰 관제 및 낭비 분석 대시보드 (과거 13.7억 토큰 백필 스크립트, 컨텍스트 팽창 낭비 진단, 최근 세션별 이력 카드, PR #44)
  - 목표 저장 직후 진행률 1회 자동 분석 및 "분석하기/다시 분석" 버튼 라벨 상태 분기 (`GoalsProgressCard`, PR #43)
  - AI 초안 생성이 편집 중인 텍스트를 확인 없이 덮어쓰던 문제 수정 (확인 모달 추가)
  - 에이전트 토큰 사용량 실측 연동: `PATCH /agent-runs/:id`가 세션뿐 아니라 API 키도
    받게 고치고, Claude Code `SessionStart`/`SessionEnd` 훅으로 실제 세션 토큰을 자동
    리포팅하는 클라이언트를 추가함 (`scripts/claude-code-hooks/`)
  - Gemini 모델 기본값을 실측으로 `gemini-3.6-flash`로 교체 (구 모델이 신규 사용자에게
    404)
  - 목표/요구사항 기반 진행률 기능 (Gemini가 README/docs 읽어 초안 생성, 확정된 목표와
    커밋 이력을 대조해 진행률 추정)
  - 레포 삭제 기능 ("Muster에서만 제거" vs "GitHub 레포 자체도 삭제")

## 차기 세션 최우선 착수 과제 (Next Priority Task)

### ⚡ 에이전트 세션 진행 중 실시간 중간 토큰(Heartbeat) 스트리밍 연동 & 대시보드 라이브 틱(Tick) 갱신

**배경 & 목표**:
- 기존에는 세션이 종료(`ended_at` 기록)된 시점에만 토큰이 확정되어, 장시간 구동 중인 대규모 에이전트 세션의 경우 작업이 끝날 때까지 대시보드에 토큰과 비용이 반영되지 않는 한계가 존재함.
- 에이전트 CLI(Claude Code, Antigravity)에서 세션 진행 중 **10초 주기 하트비트 토큰(Heartbeat Incremental Tokens)** 을 서버로 전송하고, 백엔드는 이를 수신하여 SSE 실시간 이벤트로 전파함으로써 대시보드 및 주식 차트에 무새로고침 실시간 틱(Tick) 증분 효과를 제공.

**4인 팀(PM, 백엔드, 프론트엔드, QA) 협업 분업 계획**:
1. **PM (에이전트 오케스트레이터)**:
   - 하트비트 전송 프로토콜 스펙 확정: 주기(10초), 네트워크 실패 시 지수 백오프, 에이전트 강제 종료 시 타임아웃 감지(Stale run auto-cleanup) 정책 수립.
2. **백엔드 엔지니어 (Backend Engineer)**:
   - `PATCH /agent-runs/:id/heartbeat` API 엔드포인트 구축 (API 키 인증 지원).
   - `AgentRun`의 누적 토큰 및 비용 중간 갱신 처리 (동시성 락 방어).
   - `AgentStreamService`를 통해 SSE `agent.run.heartbeat` 도메인 이벤트 브로드캐스트.
3. **프론트엔드 엔지니어 (Frontend Engineer)**:
   - 대시보드 및 프로젝트 상세 화면의 `TokenStockChart` 및 KPI 카드에 SSE 하트비트 이벤트 리스너 연결.
   - Running 세션 행에 실시간 수치 카운트업 애니메이션 및 라이브 펄스 효과 적용.
4. **QA 엔지니어 (QA Engineer)**:
   - 하트비트 수신 간격 벤치마크 및 중단/복구 엣지 케이스 테스트.
   - `pnpm -r test` 및 `pnpm -r build` 무결점 확인, Chrome CDP 실시간 캡처 검증.

## 알려진 백로그 (우선순위는 매번 사용자에게 다시 물을 것 — 여기 순서는 순위가 아니다)

- **에이전트 토큰/실행 상태 실시간 스트리밍 & 모델별 비용 세분화**:
  - [완료됨] 2026 프론티어 LLM 단가표 기반 자동 비용 계산 및 대시보드 비용($) 표기 완료.
  - [완료됨] SSE 기반 에이전트 실행 시작/종료 실시간 감지 및 대시보드 라이브 뱃지/무새로고침 수치 갱신 완료.
  - (추후 확장) 세션 진행 중 실시간 중간 토큰(Heartbeat) 스트리밍 연동.
- **실사용 기반 UX 개선을 계속 수집하는 중** — 사용자가 실제로 써보면서 불편한 점을
  하나씩 얘기해 주는 방식으로 진행 중이었다. 이 문서를 넘겨받은 시점에 이 대화를
  이어가거나, 새로 물어볼 것.
- **테스트 개별 통과/실패 개수**: "빌드·테스트 워크플로" 카드가 CI 성공/실패만 보여주고
  개별 테스트 수는 의도적으로 뺐다(DESIGN_DRIFT §11). 재도입 여부 미정.
- **VERTEX_MODEL**: GEMINI_API_KEY가 있어 실제로는 안 타는 경로라 우선순위 낮음으로
  분류하고 실측 검증은 보류하기로 함 (대신 GEMINI_API_KEY 경로가 실제로 살아있는지만
  직접 API 호출로 확인 완료).

## 작업 관례 (사용자가 반복해서 요구한 패턴)

- **4인 팀(PM, 백엔드, 프론트엔드, QA) 원팀 협업 원칙 (사용자 핵심 지침)**:
  - "항상 프론트, 백엔드, QA, PM 넷이서 한 팀으로 서로 소통하면서 움직여야 돼"
  - 단독 임의 처리를 지양하고, **PM**의 요구사항 분석 및 API 계약 수립 하에 **백엔드**와 **프론트엔드**가 긴밀히 소통하며 개발하고, **QA**가 실측 벤치마크 및 시각적 증거(스크린샷)를 통해 엄격하게 검증하는 4인 유기적 협업 체계를 반드시 준수한다.
- **세션 종료 시 PROMPT.md 검증 필수**: 사용자가 세션을 종료하겠다고 하거나 세션을 넘길 때,
  반드시 `docs/kickoff/PROMPT.md`가 최신 완료 내역 및 다음 백로그로 업데이트되어 있는지
  확인하고, 누락되어 있으면 업데이트 커밋 후 세션을 마칠 것 (최신 상태면 그대로 유지).
- **기능/버그 하나 끝낼 때마다 그 세션 안에서**: 테스트·빌드 검증 → 커밋 →
  (main 직접 커밋 금지, 항상 새 브랜치) → 푸시 → PR 생성 → CI 통과 확인 → 머지 →
  로컬 main 동기화까지 끝낸다. 사용자가 다음 걸 물어볼 때까지 기다리지 않는다.
  - **단순 문서/조사/오타 수정은 과도한 PR 금지**: 자잘한 문서 한 줄 수정마다 매번 개별 브랜치·
    PR·CI를 돌리면 과도한 대기 낭비가 발생한다. 단순 문서 수정은 로컬에 반영해 두었다가
    **실제 기능 작업 PR에 묶거나, 세션 종료 시점에 일괄 커밋·푸시**하여 정리한다.
- **프론트엔드 작업 시 시각적 증거(스크린샷/실기기 렌더링) 필수 제시**: 웹 UI 컴포넌트, 스타일, 라우트 등 프론트엔드를 개발하거나 수정했을 때는 단순히 "수정 완료"라는 텍스트 설명이나 코드 diff만으로 끝내지 않는다. **반드시 실제 렌더링된 화면 스크린샷(데스크톱 및 모바일 반응형 뷰)이나 시각적 동작 증거를 검증하고 사용자에게 직접 보여줄 것**. 브라우저 없는 환경이라도 컴포넌트 프리뷰, 헤드리스 캡처 또는 아티팩트 등으로 가시적인 검증 결과를 함께 제공한다.
- **다중 작업 요청 시 서브에이전트 병렬 처리**: 사용자가 한 프롬프트에서 2개 이상의 독립된
  작업을 요구할 경우, 순차 실행으로 지연시키지 않고 서브에이전트(Subagents)를 적극 띄워
  동시 병렬로 수행하고 결과를 취합한다.
- **커밋 메시지**: Conventional Commits 스타일(`feat:`, `fix:`, `style:` 등), 본문에
  "왜"를 적는다. `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` 같은 저작자
  트레일러는 네 자신의 모델/도구 이름으로 바꿔 쓸 것 — Claude 이름을 그대로 쓰지 않는다.
- **설계서를 기계적으로 따르지 않는다**: 구현 세부에서 더 나은 선택이 있으면 그쪽을
  택하되, 갈라진 지점은 전부 `docs/DESIGN_DRIFT.md`에 새 번호로 기록한다. "문서 누락"
  (설계서에 없지만 기능이 동작하려면 필요한 것) vs "개선 채택"(설계서에 있지만 다르게
  간 것) 두 카테고리로 분류한다.
- **기술 사실은 기억이 아니라 확인한다**: 새 라이브러리 API, 모델 이름, 요금제 등은
  추측하지 말고 실제로 검증(웹 검색, 실제 API 호출, 실제 파일 열람)한 뒤 근거를 남긴다.
  이 프로젝트에서 실제로 두 번 문제가 됐다(DESIGN_DRIFT §8, Gemini 모델 404).
- **배포는 수동이다**: `./scripts/deploy-cloudrun.sh`를 로컬에서 돌린다(gcloud 인증
  필요, 프로젝트 `muster-twent`). `.github/workflows/deploy.yml`은
  `workflow_dispatch`로만 걸려 있다. 배포 전에 `pnpm -r build && pnpm -r test`가
  통과하는지 확인할 것. 새 마이그레이션이 있으면 배포와 별개로 사람이 돌린다
  (`docs/DEPLOY.md` 참조) — 배포 자체가 마이그레이션을 돌리지 않는다.
- **로컬 개발 환경 함정**: `docker compose`의 `api` 컨테이너는 소스를 라이브 마운트하지만,
  며칠간 켜 둔 채로 두면 macOS Docker Desktop의 파일 감시자가 멎어 오래된 컴파일 에러를
  계속 보여줄 수 있다 — 이상하면 `docker compose restart api`부터 시도할 것.

## 환경 / 시크릿 (값은 GCP Secret Manager, 이름만 여기 적는다)

`muster-database-url`, `muster-github-client-id`, `muster-github-client-secret`,
`muster-oauth-state-secret`, `muster-gemini-api-key`(선택). 로컬 개발은
`apps/api/.env.example`을 복사해 채운다.

## 이 문서를 다시 만들 때

세션을 또 넘길 때는 이 프롬프트를 처음부터 다시 쓰지 말고, 그 시점의 git log·
DESIGN_DRIFT.md·이 대화에서 나온 새 백로그를 반영해 이 파일을 덮어쓸 것. "알려진 백로그"
중 이미 끝낸 항목은 지우고, 새로 발견한 것을 추가한다.
