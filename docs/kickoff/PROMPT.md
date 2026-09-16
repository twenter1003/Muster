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
   **가장 중요한 문서.** 13개 항목, 번호 순서대로 시간순이다.
3. [docs/DEPLOY.md](../DEPLOY.md) — 배포 절차, Supabase/Cloud Run 함정
4. [docs/AGENT_TOKEN_REPORTING.md](../AGENT_TOKEN_REPORTING.md) — 토큰 사용량 자동 리포팅
   (Claude Code 훅) 설치법

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
- **테스트**: `pnpm -r build`, `pnpm -r test`(api 유닛 430 / web 119),
  `pnpm --filter @muster/api test:e2e`(246+, 로컬 DB 필요). 전부 통과하는 게 기본 전제 —
  실패한 채로 커밋하지 않는다.
- **최근 완료된 것** (최신순, 상세는 git log):
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

## 알려진 백로그 (우선순위는 매번 사용자에게 다시 물을 것 — 여기 순서는 순위가 아니다)

- **에이전트 토큰/실행 상태 실시간 스트리밍 & 모델별 비용 세분화**:
  - 장기 실행 세션의 실시간 진행 상황 관제(SSE 또는 웹소켓).
  - 모델 패밀리(Gemini 2.5 Pro/Flash, Claude 3.7 Sonnet 등)별 단가 테이블 매핑을 통한 자동 비용 산출 고도화.
- **실사용 기반 UX 개선을 계속 수집하는 중** — 사용자가 실제로 써보면서 불편한 점을
  하나씩 얘기해 주는 방식으로 진행 중이었다. 이 문서를 넘겨받은 시점에 이 대화를
  이어가거나, 새로 물어볼 것.
- **테스트 개별 통과/실패 개수**: "빌드·테스트 워크플로" 카드가 CI 성공/실패만 보여주고
  개별 테스트 수는 의도적으로 뺐다(DESIGN_DRIFT §11). 재도입 여부 미정.
- **VERTEX_MODEL**: GEMINI_API_KEY가 있어 실제로는 안 타는 경로라 우선순위 낮음으로
  분류하고 실측 검증은 보류하기로 함 (대신 GEMINI_API_KEY 경로가 실제로 살아있는지만
  직접 API 호출로 확인 완료).

## 작업 관례 (사용자가 반복해서 요구한 패턴)

- **세션 종료 시 PROMPT.md 검증 필수**: 사용자가 세션을 종료하겠다고 하거나 세션을 넘길 때,
  반드시 `docs/kickoff/PROMPT.md`가 최신 완료 내역 및 다음 백로그로 업데이트되어 있는지
  확인하고, 누락되어 있으면 업데이트 커밋 후 세션을 마칠 것 (최신 상태면 그대로 유지).
- **기능/버그 하나 끝낼 때마다 그 세션 안에서**: 테스트·빌드 검증 → 커밋 →
  (main 직접 커밋 금지, 항상 새 브랜치) → 푸시 → PR 생성 → CI 통과 확인 → 머지 →
  로컬 main 동기화까지 끝낸다. 사용자가 다음 걸 물어볼 때까지 기다리지 않는다.
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
