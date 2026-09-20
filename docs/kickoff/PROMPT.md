# Muster 개발 인계 프롬프트

이 문서는 이전 에이전트가 작업하던 Muster 프로젝트를 새 세션의 에이전트(Claude Code, Antigravity/Gemini 등)에게 넘길 때 그대로 전달하는 킥오프 프롬프트다.

---

## 🛑 세션 시작 시 필수 실행 절차 (Hard Gate: 반드시 순서대로 수행)

에이전트는 사용자에게 첫 응답을 하기 전, **반드시 아래 4단계를 순서대로 수행**해야 한다. (이 문서를 맹신하여 코드 조회를 건너뛰지 말 것)

1. **저장소 동기화**: `git checkout main && git pull origin main` (최신: `20cf209`, PR #71 머지)
2. **지식 그래프 조회 (`graphify`) [필수]**:
   ```bash
   graphify query "<차기 과제 관련 키워드>"
   ```
   특정 관계 확인은 `graphify explain "<심볼/파일명>"`, `graphify path "<A>" "<B>"`.
3. **테스트 무결성 검증**: `pnpm -r test` (기준선 **769개** = API 511 + Web 236 + 훅 22).
   훅 테스트는 워크스페이스 밖이라 따로 돌린다:
   ```bash
   node --test scripts/claude-code-hooks/report-agent-usage.test.mjs scripts/antigravity-hooks/report-agent-usage.test.mjs
   ```
4. **문서 확인**: [docs/HANDOVER.md](../HANDOVER.md) (이번 세션 전말) · [docs/DESIGN_DRIFT.md](../DESIGN_DRIFT.md) **18번**(비용 정정) · [docs/DEPLOY.md](../DEPLOY.md)
5. **4인 원팀(PM, 백엔드, 프론트엔드, QA) 설계안 제시 및 승인**: 임의로 코딩을 시작하지 않는다.

---

## ⚠️ 현재 상태 — 코드는 머지됨, 프로덕션 반영이 남았다

- ✅ [PR #71](https://github.com/twenter1003/Muster/pull/71) 머지 완료(`20cf209`). 769개 통과.
- ⚠️ **마이그레이션 `1788920000000-AddAgentRunTokenBreakdown`이 프로덕션 DB에 미적용이다.**
  이게 없으면 새 코드가 토큰 4종 컬럼을 찾지 못해 실행 기록 저장이 실패한다. **배포보다 먼저 적용.**
- ⚠️ **Cloud Run 미배포** — 비용 7.6배 정정이 아직 사용자 화면에 반영되지 않았다.

배포 절차는 [docs/DEPLOY.md](../DEPLOY.md). 다음 과제에 착수하기 전에 이 둘을 먼저 처리할지
사용자와 정할 것.

---

## 프로젝트 개요

Claude Code/LLM 기반으로 여러 사이드 프로젝트를 진행하는 사용자가, GitHub 레포를 연동하면 커밋·배포·로그·에러·LLM 토큰/비용·목표 달성률을 한눈에 관제하는 **개인용** 대시보드.

- **아키텍처**: 정적 문서 대신 **`graphify-out/` 지식 그래프**를 조회할 것.
- **배포**: Cloud Run(`muster`, GCP `muster-twent`, `asia-northeast3`) + Supabase Postgres.
- **핵심 문서**: `docs/HANDOVER.md` · `docs/DESIGN_DRIFT.md`(최종 진실) · `docs/LLM_ECOSYSTEM_GUIDE.md`(**단가의 단일 원천**) · `docs/AGENT_TOKEN_REPORTING.md` · `docs/BUG_REPORTS.md`

### 로그인 없이 화면 보는 법 (이번 세션 신규)

프로덕션은 GitHub OAuth 뒤에 있어 UI를 열어 볼 수 없다. 목 서버를 쓴다:

```bash
pnpm --filter @muster/web build && node scripts/mock-server.mjs   # → localhost:4173
```

`.claude/launch.json`에 `mock`으로 등록되어 있다. 실기기 확인은 iOS 시뮬레이터 Safari로
`http://localhost:4173`을 열면 된다 — 크롬 에뮬레이션으로는 안 잡히는 것들이 있다(HANDOVER 2.3절).

### 도달 가능한 화면은 5개뿐

`/login`, `/invite/:token`, `/projects`, `/projects/:id`, `/import`.
`ProjectOverviewPage`·`DashboardPage`·`ReportsPage`·`SettingsPage` 등 11개 화면 파일은
**라우트가 없어 도달할 수 없다**(App.tsx:17-20). 고치기 전에 그 화면이 살아 있는지 먼저 볼 것.

---

## 최근 완료된 것 (최신순)

- **토큰 4종 분리 · 비용 7.6배 과다 계상 정정** (`a29ce7a`, DESIGN_DRIFT 18번)
  - 훅이 `input+cache_creation+cache_read`를 합쳐 보내고 서버가 정규 입력가로 곱하고 있었다.
    실제 세션 12개 집계 결과 입력의 98.6%가 캐시 읽기 → **$2,777 vs $364.94**.
  - `AGENT_RUNS`에 토큰 4종 컬럼 추가, 단가표에 캐시 읽기·쓰기 단가 추가, `sync-embedded-hooks.mjs` 신규.
- **iOS 실기기 발견 수정** (`beea474`, `6b434a7`, `faa1fed`): Safari 입력 확대(`pointer: coarse`),
  A/B HUD가 목록 가림, 초대 문구 주어 누락, 하드코딩 "운영 중" 배지 제거.
- **모바일 반응형 + 목 서버** (`bab0566`, `5e76d8a`): ApiKeyModal/Modal 레이아웃, 차트 축 라벨
  5.1px → 전 구간 10px(`ResizeObserver` 보정), 터치 표적 44px.
- **God-file 분리** (`53e9c71`, `0ada7e7` — PR #70 머지됨): `budget.service.ts` 977→159줄,
  `ProjectOverviewPage.tsx` 1997→641줄. 순수 이동.

---

## 차기 세션 최우선 착수 과제

> **사용자 지시**: 서비스 범위를 넓히는 **신규 기능은 금지**. 개선에 필요한 추가 개발은 허용.

### 🎯 과제명: 낭비 판정·캐싱 ROI를 상수 추정에서 측정값으로 교체

#### 왜 지금인가

`a29ce7a`로 진짜 캐시 수치가 들어오기 시작했다. 그런데 그 위에 얹힌 판단은 아직 전부 상수다.

- `token-waste.ts`: 세션 토큰 5천만/1천만 초과 → 60%/25% 낭비로 판정. **토큰이 큰 이유가 대개
  캐시 읽기가 쌓여서이므로, 캐싱이 가장 잘 든 세션이 가장 낭비가 심하다고 찍힌다**(실제 12개 중 5개).
- 캐싱 ROI: 중복 읽기를 `총토큰 × 0.15`로 고정, 적중률은 낭비율에서 역산 → "$6.23 절감(42%)"처럼
  측정값의 정밀도로 표시. **정확히 계산할 데이터를 이미 갖고 있으면서 추정한다.**

#### 4인 원팀 설계 방향

- **📌 PM**: 판정을 발표하지 말고 산수를 보여준다. 벤치마크한 제품 중 "낭비 토큰"이라는 숫자를
  주장하는 곳은 하나도 없었다 — Helicone은 "73% 적중, $1,247 절감"(반사실), OpenRouter는
  "어디서 캐시가 깨졌는지"(진단), Braintrust는 중앙값 대비 p99(분포)로 표현한다.
- **⚙️ 백엔드**: 캐싱 절감액 = `cache_read_tokens × (정규 입력가 − 캐시 읽기가)`. 캐시 적중률 =
  `cache_read / (input + cache_write + cache_read)`. 둘 다 실제 컬럼에서 바로 나온다.
  임계값 기반 `assessSessionWaste`는 걷어내고, 세션당 비용 분포(중앙값·p99)를 낸다.
  내역이 없는 옛 실행(nullable)은 "모름"으로 두고 집계에서 빼야 한다 — 0으로 세면 왜곡된다.
- **🎨 프론트엔드**: "낭비 인텔리전스" 카드를 적중률·절감액·분포로 재구성. 이상치는 해당 세션으로
  점프할 수 있게(숫자만 있고 갈 곳이 없는 것이 피어들이 피하는 형태다).
- **🧪 QA**: 실제 트랜스크립트(`~/.claude/projects/*/*.jsonl`) 집계값과 화면 숫자를 대조한다.
  이번 7.6배 발견이 그 방법으로 나왔다.

#### 그다음 후보

2. **상세 페이지 재편**(카드 12개 → 3~4묶음 + 상단 판정 한 줄, API 키는 설정으로) — Grafana 2026-04,
   Sentry 2025-02, Vercel의 방향과 일치. 기능 추가 없이 재배치.
3. **빈 상태 개선** — 레포를 막 가져오면 7개 카드 중 1개만 데이터가 있다.
4. **도달 불가 화면 11개 처리 방침** — 지울지 되살릴지.

---

## 작업 관례 (사용자 필수 지침)

- **한국어로 쓴다**: 사용자 응답·커밋 메시지·PR 본문 전부.
- **4인 팀(PM, 백엔드, 프론트엔드, QA) 원팀 협업**: PM의 계약 하에 백엔드·프론트엔드가 소통하고,
  QA가 실측과 시각적 증거로 검증한다.
- **세션 내 완결 원칙**: 테스트·빌드 → 브랜치 커밋 → 푸시 → PR → CI → 머지 → 배포 → `main` 동기화.
  2026-09-19 세션에서 PR이 중간에 머지되며 이후 6커밋이 붕 뜬 적이 있다(PR #71로 정리됨).
  **푸시했다고 머지된 것이 아니다** — 세션 끝에 `git log origin/main..HEAD`로 남은 것이 없는지 볼 것.
- **근거 없는 숫자를 만들지 않는다**: 단가·할인율은 `LLM_ECOSYSTEM_GUIDE.md`가 단일 원천.
  출처가 없으면 비워 두거나 비싸게 잡는다.
- **훅 수정 시 임베딩 동기화**: `node scripts/sync-embedded-hooks.mjs` (검증 `--check`).
- **프론트엔드 시각적 증거 필수**: 목 서버 + 실기기 스크린샷(데스크톱·모바일).
- **코드 수정 후 `graphify update .`**.
- **세션 종료 전 이 문서와 HANDOVER.md 갱신**.
