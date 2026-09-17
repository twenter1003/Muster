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
- **테스트**: `pnpm -r build`, `pnpm -r test`(api 유닛 475 / web 171 / muster-connect 13 = 총 659개),
  `pnpm --filter @muster/api test:e2e`(246+, 로컬 DB 필요). 전부 통과하는 게 기본 전제 —
  실패한 채로 커밋하지 않는다.
- **최근 완료된 것** (최신순, 상세는 git log):
  - **에이전트 세션 진행 중 실시간 중간 토큰(Heartbeat) 스트리밍 연동 & 대시보드 라이브 틱(Tick) 갱신** (수십 분 이상 지속되는 대형 에이전트 세션 중 10초 주기 중간 토큰/비용 갱신 `PATCH /agent-runs/:id/heartbeat`, 도메인 이벤트 `DomainEvent.AGENT_RUN_HEARTBEAT` 및 프로젝트 격리 SSE 스트림 브로드캐스트, 웹 프론트엔드 `TokenStockChart` HUD 라이브 틱 뱃지 및 상세 상단 실시간 누적 카운터 `⚡ 라이브 틱 +N tokens` 무새로고침 펄스 애니메이션 연동, `npx muster-connect` CLI 및 Claude Code / Antigravity 내장 훅 실시간 연동 완료, API 475개 / Web 171개 / muster-connect 13개 등 총 659개 유닛 테스트 All Green 및 Chrome CDP 데스크톱/모바일 14종 스크린샷 검증 완료)
  - **주식 차트형 다차원 토큰 모니터링 (월/일/시간) & 모델별 토큰·비용 브레이크다운 (Cloud Run 배포 완료)** (TradingView/Upbit 스타일 인터랙티브 SVG 토큰 차트(`TokenStockChart`), 세그먼트 스위처 3버튼(`시간별`/`일간`/`월간`), 크로스헤어 HUD 툴팁, 모델 점유율 카드(`ModelUsageBreakdown`), Anthropic/Google/OpenAI/DeepSeek 컬러 뱃지 및 프로그레스 바, 백엔드 타임존 버킷팅 및 `ModelPricingService` 기반 무마이그레이션 안전 집계, API 472개 / Web 170개 전원 통과, PR #60, 커밋 `163289e`, Cloud Run `muster-00037-9dt`)
  - **대용량 목표 체크리스트 UX 전면 개선 (미니 요약 HUD + 슬라이드 드로어/바텀시트)** (대시보드 목표 카드 높이 ~200px 고정, Top 3 미완료 우선순위 체크박스, 네이티브 `<dialog>` 기반 우측 슬라이드 드로어(460px) 및 모바일 85vh 바텀시트, 실시간 키워드 검색·상태 필터 칩, PR #59, 커밋 `91ef4ee`, Cloud Run `muster-00036-6qd`)
  - **초고속 장애 진단 런북 및 원클릭 진단 스크립트(`scripts/diagnose-live.sh`) 구축** (실서버 500 에러 및 UI 결함 발생 시 5초 만에 원인 규명, GitHub Issue 버그 템플릿 및 자동 점검 CLI 구축, `docs/BUG_REPORTS.md`)
  - **목록 쿼리 PostgreSQL `DISTINCT ON` 최적화 및 고속 요약 API (`GET /projects?summary=true`)** (10개 프로젝트 기준 41회 개별 HTTP 요청을 단 1회로 통합(97.6% 감축, 66배 가속, 제로 레이아웃 시프트), PR #55, #57, Cloud Run `muster-00035-rzz`)
  - **모바일 뷰포트(360px~480px, 980px 모바일 데스크톱 모드) 전면 반응형 최적화 & Chrome CDP 캡처 고도화** (상단바/목록/세션 카드 모바일 1열 최적화, 줌아웃 방지, 실기기 390x844 CDP 스크린샷 캡처 자동화, PR #56, Cloud Run `muster-00034-8bt`)
  - **무설치 1줄 연동 CLI (`npx muster-connect`) 및 2026 프론티어 LLM 단가 엔진 / SSE 실시간 세션 관제** (외부 의존성 제로 CLI, Claude Code & Antigravity 실측 토큰 연동, 단가표 엔진 및 비용($) 산출, SSE 라이브 뱃지, PR #46, #48, #52)
  *(과거 완료 내역: 목표 달성률 마일스톤 결정론적 산출, AI 초안 확인 모달, 토큰 낭비 분석 대시보드, 레포 삭제 등은 git log 참조)*

## 차기 세션 최우선 착수 과제 (Next Priority Task)

### 🧠 에이전트 토큰 낭비 인텔리전스 및 2026 프롬프트 캐싱(Prompt Caching) 최적화 가이드

**배경 & 필요성**:
- 현재 Claude Sonnet 5, Gemini 3.6 Flash, GPT-5.6 Terra 등 최신 에이전트 모델의 비용 절감 핵심은 프롬프트 캐시 적중률(90%+ 달성 시 90% 비용 절감)임.
- 반복 툴 호출 및 긴 컨텍스트에서 발생하는 토큰 낭비 패턴(불필요한 전체 파일 재조회, 거대 diff 누적 등)을 Muster 백엔드에서 자동 분석하여 대시보드에 절감 기회와 캐싱 최적화 가이드를 제공하고자 함.

**4인 원팀 협업 개발 계획**:
1. **PM (오케스트레이터)**:
   - 캐싱 적중률 및 낭비 지표 산출 공식(Read vs Written 토큰 비중, 캐시 할인 적용 비용 시뮬레이션) 명세 수립.
2. **백엔드 (Backend)**:
   - `AgentRunsService` 내 세션별 캐시 효율 지수 산출 로직 확장 및 `GET /projects/:id/token-waste-intelligence` 엔드포인트 구축.
   - 단위 테스트 작성 및 기존 토큰 집계 파이프라인 무중단 통합.
3. **프론트엔드 (Frontend)**:
   - `TokenStockChart` 인근에 "캐싱 최적화 인텔리전스 카드" 배치 (예상 절감 비용, 캐시 적중률 게이지).
   - 에이전트 훅 개선 권장사항 모달 또는 인터랙티브 툴팁 UI 구현.
4. **QA (품질 검증)**:
   - 다양한 토큰 사용 패턴에 따른 캐시 절감 시뮬레이션 수치 검증.
   - 전체 테스트 All Green 및 Chrome CDP 데스크톱/모바일 스크린샷 확보.

## 알려진 백로그 (우선순위는 매번 사용자에게 다시 물을 것 — 여기 순서는 순위가 아니다)

- **에이전트 토큰 낭비 인텔리전스 고도화**:
  - 컨텍스트 팽창 낭비 진단 및 2026 프롬프트 캐싱(Prompt Caching) 최적화 가이드 제공.
- **프로젝트 상세 에이전트별 토큰 사용량 비교 필터링**:
  - 특정 에이전트(Claude vs Gemini vs Cursor)별 주식 차트 필터링 기능 강화.
- **테스트 개별 통과/실패 개수**:
  - "빌드·테스트 워크플로" 카드가 CI 성공/실패만 보여주고 개별 테스트 수는 의도적으로 뺐다(DESIGN_DRIFT §11). 재도입 여부 미정.
- **실사용 기반 UX 피드백 반영**:
  - 사용자가 실제로 써보면서 불편한 점을 하나씩 수집하여 개선.

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
