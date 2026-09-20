# Muster 개발 인계 프롬프트

이 문서는 이전 에이전트가 작업하던 Muster 프로젝트를 새 세션의 에이전트(Claude Code, Antigravity/Gemini 등)에게 넘길 때 그대로 전달하는 킥오프 프롬프트다.

---

## 🛑 세션 시작 시 필수 실행 절차 (Hard Gate: 반드시 순서대로 수행)

에이전트는 사용자에게 첫 응답을 하기 전, **반드시 아래 4단계를 순서대로 수행**해야 한다. (이 문서를 맹신하여 코드 조회를 건너뛰지 말 것)

1. **저장소 동기화**: `git checkout main && git pull origin main` (최신: `678de62`,
   [PR #73](https://github.com/twenter1003/Muster/pull/73) 머지 반영).
2. **지식 그래프 조회 (`graphify`) [필수]**:
   ```bash
   graphify query "<차기 과제 관련 키워드>"
   ```
   특정 관계 확인은 `graphify explain "<심볼/파일명>"`, `graphify path "<A>" "<B>"`.
3. **테스트 무결성 검증**: `pnpm -r test` (기준선 **766개** = API 511 + Web 231 + 훅 24).
   e2e는 별도 스크립트다(`pnpm --filter @muster/api test:e2e`, 로컬 Postgres 필요).
   훅 테스트는 워크스페이스 밖이라 따로 돌린다:
   ```bash
   node --test scripts/claude-code-hooks/report-agent-usage.test.mjs scripts/antigravity-hooks/report-agent-usage.test.mjs
   ```
4. **문서 확인**: [docs/HANDOVER.md](../HANDOVER.md) (이번 세션 전말) · [docs/DESIGN_DRIFT.md](../DESIGN_DRIFT.md) **18·19번**(비용 정정과 그 후속) · [docs/DEPLOY.md](../DEPLOY.md)
5. **4인 원팀(PM, 백엔드, 프론트엔드, QA) 설계안 제시 및 승인**: 임의로 코딩을 시작하지 않는다.

---

## ✅ 현재 상태 — 코드·배포 전부 끝남

- ✅ [PR #71](https://github.com/twenter1003/Muster/pull/71) 머지 완료(`20cf209`).
- ✅ [PR #72](https://github.com/twenter1003/Muster/pull/72) 머지·마이그레이션·배포 완료
  (`a1fb436`, `muster-00042-v72`): 낭비 판정→측정값 교체.
- ✅ [PR #73](https://github.com/twenter1003/Muster/pull/73) 머지·배포 완료(`0e724a9`,
  `muster-00043-rf8`, 2026-09-20): 배포된 화면을 직접 확인해 찾은 3건(A/B HUD 모바일 짤림,
  모델명 조작, 목표 AI 자동판정 제거) 수정. 766개(단위) + e2e 243개 통과. 스키마 변경이
  없어 마이그레이션은 필요 없었다.
- 📌 **후속 과제 진행 중**: `ProjectProgressSnapshot` 죽은 테이블 스키마 정리가 별도
  세션에 위임되어 진행 중이다(spawn_task). 다음 세션은 그 결과부터 확인할 것.
- 🔎 **새로 발견됨 (2026-09-20, 코드 변경 없음)**: "모델별 토큰·비용 점유율"이 여전히
  "모름"으로 뜬 원인을 프로덕션 DB 직접 조회로 추적한 결과, API 한계가 아니라 **이 컴퓨터에
  전역 설치된 훅(`~/.muster/hooks/...`)이 218줄 낡아서 애초에 model·토큰 필드를 안 보내고
  있었던 것**이었다. `installGlobalHookScripts()`로 이 컴퓨터만 갱신 완료(리포 코드 무변경).
  이 과정에서 사용자가 구조적 결함을 지적함: "훅 코드를 고칠 때마다 이미 설치된 머신은
  전부 수동 재설치해야 하나?" → **맞다, 현재 버전 체크/자동 갱신 로직이 전혀 없다.**
  자세한 내용·해결 방향은 [docs/HANDOVER.md](../HANDOVER.md) 최상단 섹션 참조.

차기 세션 최우선 과제는 아래 "🎯 다음 과제명"이 **상세 페이지 재편이 아니라 훅 버전
확인/갱신**으로 바뀌었다.

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

- **낭비 판정→측정값 교체** (2026-09-20, [PR #72](https://github.com/twenter1003/Muster/pull/72)): `token-waste.ts`
  임계값 판정 제거 → 실측 캐시 적중률·절감액·비용 분포(중앙값/p99)로 교체. 780개 통과.
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

### ✅ 완료: 낭비 판정·캐싱 ROI를 상수 추정에서 측정값으로 교체 (2026-09-20)

`token-waste.ts`를 전면 재작성해 임계값 판정(60%/25% 낭비)과 상수 기반 ROI 시뮬레이션을
실측 캐시 적중률·절감액·세션당 비용 분포(중앙값/p99, 이상치 점프)로 교체했다. 백엔드 3곳,
프론트 3곳, `mock-server.mjs`까지 갱신, 780개 통과. [PR #72](https://github.com/twenter1003/Muster/pull/72)
머지 완료(`a1fb436`). 상세는 [docs/HANDOVER.md](../HANDOVER.md) "0. 이번 세션 완료 내역" 참조.

### ✅ 완료: 배포된 화면 3건 수정·배포 (A/B HUD 제거·모델명 조작 수정·목표 AI 자동판정 제거, 2026-09-20)

[PR #73](https://github.com/twenter1003/Muster/pull/73) 머지·배포 완료. 상세는
[docs/HANDOVER.md](../HANDOVER.md) 참조.

### 🎯 다음 과제명: 훅 버전 확인/갱신 (신규 발견 — 신뢰성 개선, 신규 기능 아님)

이번 세션에서 "모델별 토큰·비용 점유율"이 "모름"으로 뜨는 원인을 추적하다가, **훅 코드에
버전 체크·자동 갱신 로직이 전혀 없다**는 구조적 결함을 발견했다(사용자 지적: "실시간으로
해야하는데 설치가 낡았다 그럼 뭐 매번 설치해야하는거야?"). 이미 설치된 머신은 훅 코드를
고쳐도 영영 옛 버전으로 남는다 — 오늘 겪은 "모름 100%" 사고가 구조적으로 반복될 수 있다.

**제안(검토 완료, 구현 대기)**: 훅이 서버로 보내는 payload에 `hook_version`을 추가 →
서버가 최신 버전보다 낮으면 감지 → 프로젝트 상세 화면에 "이 머신 훅이 오래됨,
`npx muster-connect` 재실행" 배너 표시. 스크립트 자가 다운로드·실행 방식(리스크·복잡도 큼)은
기각했다. 상세 근거는 [docs/HANDOVER.md](../HANDOVER.md) 최상단 섹션 참조.

착수 전 확인할 것: `hook_version` 상수를 어디 둘지(리포 버전 `package.json`과 동기화? 별도
상수?), 서버 쪽 "최신 버전"을 어떻게 아는지(배포 시점 값을 env로 주입? DB에 저장?), 배너를
어느 화면(프로젝트 상세/전역)에 어떤 조건(에이전트별/머신별)으로 띄울지 — 4인 팀 설계안으로
정리 후 착수.

#### 그다음 후보: 상세 페이지 재편 (기능 추가 없이 재배치)

카드 12개를 항상 펼친 채 쌓아 두는 현재 구조는 현행 규범과 어긋난다.

- Grafana는 2026-04 Dynamic Dashboards GA에서 "과도한 세로 스크롤"을 고치려 탭·조건부 렌더링 도입
- Sentry는 2025-02 이슈 상세를 모두 접히는 섹션 + 스티키 헤더로 전환(정보 위계·점진적 공개)
- Vercel 프로젝트 상세는 탭 구조

제안: **개요 / 에이전트(토큰·모델·캐싱·세션) / 배포(배포·빌드) / 설정(API 키)** 3~4묶음 +
상단에 "지금 이상 있나"를 답하는 한 줄. **API 키 관리는 관제 흐름에서 설정으로 빼야 한다** —
피어 중 자격증명을 모니터링 화면에 두는 곳은 없다. 자세한 벤치마크 근거는 HANDOVER 후보 2 참조.

#### 그다음 후보

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
