# Muster 프로젝트 세션 인수인계서 (Handover Document)

- **작성 일시**: 2026-09-20
- **작업자 / 모델**: Claude Code (Claude Sonnet 5)
- **현재 브랜치**: `refactor/measured-cache-roi` (PR 대기)

## 저장소 상태 — 낭비 판정→측정값 교체 완료, 마이그레이션·배포는 여전히 남음

- ✅ **코드**: 이번 세션에서 `token-waste.ts`의 임계값 기반 낭비 판정을 실측 캐시 적중률·절감액·
  비용 분포로 교체(HANDOVER 후보 1, DESIGN_DRIFT 18번의 남은 과제). 백엔드 3곳(`usage-timeseries`,
  `token-waste-report`, `agent-runs`)·프론트 3곳(`TokenWasteIntelligenceCard`, `SessionWasteModal`,
  `ProjectDetailPage`)·`mock-server.mjs`까지 전부 갱신. 브랜치 `refactor/measured-cache-roi`에
  푸시 대기 — **PR·머지·`main` 동기화가 아직 안 끝났다.**
- ✅ **검증**: 780개 통과(API 517 + Web 241 + 훅 22, 이전 769개에서 +11), 빌드·린트 통과,
  목 서버로 데스크톱·모바일 시각 확인 완료.
- ⚠️ **마이그레이션 미적용**: `1788920000000-AddAgentRunTokenBreakdown`이 **프로덕션 DB에 적용되지
  않았다.** 이 마이그레이션 없이 새 코드가 뜨면 토큰 4종 컬럼이 없어 실행 기록 저장이 실패한다.
  **배포보다 먼저 적용할 것.**
- ⚠️ **Cloud Run 미배포**: 프로덕션은 여전히 이전 리비전이다. 비용 7.6배 정정과 이번 캐시 지표
  교체 모두 아직 사용자가 보는 화면에 반영되지 않았다.

---

## 0. 이번 세션 완료 내역 — 낭비 판정을 실측값으로 교체

`docs/kickoff/PROMPT.md`가 지정한 최우선 과제(후보 1)를 처리했다. `a29ce7a`로 토큰 4종 컬럼이
들어왔지만 그 위의 판정 로직은 여전히 임계값 상수였다 — 이번 세션에서 실측값으로 바꿨다.

**무엇을 바꿨나** (`apps/api/src/modules/agent-registry/token-waste.ts` 전면 재작성):
- `assessSessionWaste()`(토큰 5천만/1천만 → 60%/25% 낭비 판정)와 `computeWasteInsight()`를
  제거했다. 캐시 읽기가 쌓인 세션을 가장 낭비가 심하다고 찍는 오류가 있었다(DESIGN_DRIFT 18번).
- `computeCacheEfficiency()`: 캐시 적중률 = `cache_read / (input + cache_write + cache_read)`,
  절감액 = `cache_read_tokens × (모델별 정규 입력가 − 캐시 읽기가)`. 둘 다 실측 컬럼에서 바로
  나온다. 토큰 내역이 없는(예전) 실행은 **0이 아니라 집계에서 제외**한다 — "모름"과 "캐시 안 씀"은
  다르다.
- `computeCostDistribution()`: 세션당 비용의 중앙값·p99와, 중앙값의 2배 이상이면서 상위 1%에
  드는 이상치 세션 목록(점프 가능). 임계값으로 "낭비"를 선언하지 않고 분포만 보여준다
  (Braintrust 방식 — HANDOVER 벤치마크 조사 참조).
- 정적인 캐싱 실천 가이드(`OPTIMIZATION_GUIDES`)와 모델별 캐시 단가 벤치마크는 유지했다 — 이건
  프로젝트별 "판정"이 아니라 공통 참고 정보라 남겨 둘 근거가 있었다.

**호출부 갱신**: `usage-timeseries.service.ts`(대시보드 API), `token-waste-report.service.ts`
(CSV/JSON 내보내기), `agent-runs.service.ts`(세션 상세)의 세 갈래 모두 새 지표로 교체.
`ModelPricingService.resolvePricingRates()`를 추가해 세 곳이 같은 어댑터로 모델별 단가를 주입한다.

**프론트엔드**: `TokenWasteIntelligenceCard.tsx`(낭비 뱃지·게이지 제거 → 절감액/적중률/비용
분포 3분할 + 이상치 클릭 시 세션 점프), `SessionWasteModal.tsx`("심각한 낭비 감지" 진단 제거 →
캐시 적중률(실측) + "프로젝트 중앙값의 N배" 상대 비교), `ProjectDetailPage.tsx`(세션 행 뱃지를
캐시 적중률 칩으로 교체, 내역 없으면 "캐시 내역 없음"으로 표시). `mock-server.mjs`도 새 응답
형태로 갱신하고 목 서버 + iOS 시뮬레이터로 데스크톱·모바일 렌더링을 확인했다.

**검증**: 신규/수정 테스트 포함 780개 통과(이전 769개 → API 517·Web 241·훅 22 그대로).
`token-waste.spec.ts`는 실측 시나리오(입력 98.6%가 캐시 읽기인 경우 등)로 전면 재작성했다.

**남은 것**: 브랜치 `refactor/measured-cache-roi`는 아직 PR·머지 전이다. 마이그레이션
`1788920000000`과 Cloud Run 배포는 사용자 지시로 이번 과제 완료 후 처리하기로 미뤘다.

---

## 1. 이전 세션 완료 내역 (2026-09-19)

세션은 "기능 추가"가 아니라 **재정비 → 모바일 품질 → 비용 정확도**로 흘렀다.

### 1.1 God-file 분리 (순수 이동, 로직 변경 없음)

`graphify-out/GRAPH_REPORT.md`의 저응집도 신호로 대상을 고르고, 테스트 결과가 한 글자도
바뀌지 않는 것으로 "순수 이동"을 증명했다.

- `budget.service.ts` **977 → 159줄**: 예산 CRUD/알림만 남기고 `UsageTimeseriesService`(시계열·번레이트),
  `TokenWasteReportService`(낭비 리포트 JSON/CSV)로 분리
- `ProjectOverviewPage.tsx` **1997 → 641줄**: 하위 컴포넌트 12개를 `components/`로 분리하고
  공유 타입·포맷 헬퍼·`Card`/`Async`는 `ProjectOverviewShared.tsx`로

### 1.2 로그인 없는 목 서버 (신규) — `scripts/mock-server.mjs`

프로덕션이 GitHub OAuth 뒤에 있어 UI를 열어 볼 수가 없었다. 빌드된 SPA + `/api/v1/*` 전체를
가짜 데이터로 응답한다. **이후의 모든 발견이 이 도구 덕분이다.**

```bash
pnpm --filter @muster/web build && node scripts/mock-server.mjs   # → localhost:4173
```

`.claude/launch.json`에 `mock`으로 등록되어 있다. 값 집합은 `domain.ts`의 실제 열거형을 따른다 —
틀린 값을 넣으면 배지가 조용히 안 그려져 화면이 멀쩡한지 판단할 수 없다.

### 1.3 모바일 반응형 (폭 320~1440px 전 구간 검증)

- `ApiKeyModal`: 키 행·발급 바가 감싸지 않아 폐기 버튼이 세로 두 글자로 쪼개지고 다이얼로그가
  가로 스크롤됐다 → `flex-wrap` + `min-width: 0`
- 공용 `Modal`(모든 다이얼로그에 영향): 닫기 버튼 20px → 44×44, `panel`에 `min-width: 0`
- `TokenStockChart` 축 라벨이 **5.1px**로 그려지고 있었다(측정값). 처음엔 `@media`로 잡았으나
  320·360px에서 여전히 작고 **1200px 데스크톱에서 8.7px로 더 나빴다** — 1100px부터 2단이 되며
  차트가 1009px → 521px로 좁아지기 때문. 뷰포트와 요소 폭이 같이 가지 않으므로 `ResizeObserver`로
  실제 렌더 폭을 재서 배율을 상쇄한다(`axisFontSizeFor`) → 16개 폭 전부 10.0px
- 마지막 축 라벨을 무조건 추가하느라 직전 라벨과 겹치던 버그(`pickAxisLabelIndices`)
- 터치 표적 21px → 44px (터치 기기에서만, 데스크톱 모양 유지)

### 1.4 iOS 실기기(iPhone 16e, iOS 26.1)에서만 드러난 것

크롬 뷰포트 에뮬레이션으로는 재현되지 않는 것들이다.

- **입력 포커스 시 Safari가 화면을 확대** → "배포 실패" 칩과 정렬 셀렉트가 화면 밖으로 잘렸다.
  원인은 입력 글자 16px 미만. `@media (pointer: coarse)`로 잡았다 — 폭이 아니라 **입력 방식**이
  신호이므로 데스크톱은 건드리지 않는다
- **A/B HUD가 목록 첫 카드를 통째로 가림** → 접힘 기본값이 false라 첫 방문자는 언제나 가려진
  목록을 봤다. 저장된 선택이 있으면 그대로, 없을 때만 좁은 화면에서 접는다
- **초대 문구 주어 누락** ("가 이 프로젝트로 초대했습니다") → 앱은 `=== null`을 방어하지만
  서버가 필드를 생략하면 `undefined`라 빠져나간다. `??`로 교체
- **하드코딩된 "운영 중" 배지 제거**(사용자 결정) → 단계와 무관하게 늘 찍혀서, design 단계에
  배포까지 실패한 프로젝트도 "운영 중"으로 보였다

### 1.5 비용 정확도 근본 수정 — 이번 세션에서 가장 큰 것

**증상**: 표시 비용이 실제의 **7.6배**. 이 기기의 Claude Code 세션 12개(4,254 메시지)를 집계해
확인했다 — 입력 토큰의 **98.6%가 캐시 읽기**(정규 입력가의 10%)인데 전부 정규가로 곱하고 있었다.
같은 데이터로 **$2,777 vs $364.94**.

**원인**: 훅이 `input + cache_creation + cache_read`를 합쳐 하나로 보내고 서버가 그 합계를
정규 입력가로 곱했다. `LLM_ECOSYSTEM_GUIDE` 5장은 이미 **네 필드를 모두 수집하라**고 적고 있었다 —
설계서와 어긋난 게 아니라 우리 문서대로 하지 않고 있었다.

**곁가지로 함께 틀어져 있던 것**:
- 낭비 판정이 거꾸로다. 토큰이 큰 이유가 대개 캐시 읽기가 쌓여서인데, 그걸 낭비로 찍는다 —
  **캐싱이 가장 잘 든 세션이 가장 낭비가 심하다고 분류된다**(실제 12개 중 5개가 HIGH_WASTE)
- 캐싱 ROI가 상수에서 나온다(`총토큰 × 0.15` 고정, 적중률은 낭비율에서 역산)
- 자기모순: "캐싱을 쓰라"고 권하는데 따를수록 표시 비용이 실제와 벌어진다

**조치**: `AGENT_RUNS`에 토큰 4종 컬럼 추가(마이그레이션 `1788920000000`), 단가표에 캐시 읽기·쓰기
단가 추가(가이드 2장에 실린 모델만), 훅이 네 값을 나눠 전송. 자세한 판단은 **DESIGN_DRIFT 18번**.

부수적으로 `muster-connect`의 base64 임베딩 훅이 **실제로 원본과 어긋나 있었다**(손으로 동기화해
온 탓). `scripts/sync-embedded-hooks.mjs`로 갱신·검증(`--check`)을 자동화했다.

---

## 2. 알아 두면 시간을 아끼는 것들

### 2.1 라우팅되지 않는 화면이 많다

`App.tsx`가 거는 라우트는 **5개뿐**이다: `/login`, `/invite/:token`, `/projects`,
`/projects/:id`, `/import`.

`ProjectOverviewPage` · `DashboardPage` · `ReportsPage` · `SettingsPage` · `EnvCatalogPage` ·
`AgentRegistryPage` · `DocStorePage` · `AuditLogPage` · `InboxPage` · `LogsHealthPage` ·
`EnvConfigCreatePage`는 **파일만 남고 도달할 수 없다**(사유는 App.tsx:17-20).

이번 모바일 수정을 **도달 가능한 화면에만** 한정한 이유다. 서브에이전트가 "반드시 고쳐야 한다"고
올린 항목 중 둘(`DocumentTable`, `DashboardPage` 표)이 이 죽은 영역에 있었다. 이 파일들을
지울지 라우트를 되살릴지는 아직 정해지지 않았다.

### 2.2 첫날 화면이 거의 빈다

레포를 막 가져온 상태에서 데이터가 있는 카드는 7개 중 **1개(최근 커밋)** 뿐이다.
배포·빌드는 GitHub Actions가 있어야 하고, **에러 로그는 본인 앱에 직접 POST 코드를 심어야
한다**(`@Post(':id/logs')` + `ApiKeyGuard` — 수동 계측), 토큰 관련 카드 4개는 `muster-connect`
설치 후 에이전트를 돌려야 채워진다.

### 2.3 실기기 검증 방법

```bash
xcrun simctl boot "iPhone 16e" && xcrun simctl ui <UDID> appearance dark
# 시뮬레이터 Safari에서 http://localhost:4173 열기 (목 서버가 떠 있어야 함)
```

다크 모드가 이 앱의 주 디자인이다. 라이트도 정상 동작한다(`tokens.css`가 `prefers-color-scheme`를
존중). 모달 닫기 버튼의 검은 테두리는 `app.css:435`의 `:focus-visible` 포커스 링이며 **접근성상
필요하므로 지우면 안 된다**.

### 2.4 실제 토큰 사용량을 재는 법

제품의 숫자가 맞는지 의심될 때 `~/.claude/projects/*/*.jsonl`을 직접 집계하면 된다.
`message.usage`에 `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`가 들어 있다. 이번 7.6배 발견이 이 방법으로 나왔다.

---

## 3. 차기 세션 작업 후보

사용자 지시: **서비스 범위를 넓히는 신규 기능은 금지**. 다만 개선에 필요한 추가 개발은 허용.

### ✅ 후보 1 완료 (2026-09-20): 낭비 판정·캐싱 ROI를 측정값으로 교체

`refactor/measured-cache-roi` 브랜치에서 완료. 상세는 위 "0. 이번 세션 완료 내역" 참조.
PR·머지가 아직이라 다음 세션은 그것부터 확인할 것.

**벤치마크 근거(조사 결과, 참고용으로 남겨 둠)**: 조사한 제품 중 "낭비 토큰"이라는 숫자를
주장하는 곳은 **하나도 없었다**. Helicone은 관측된 캐시 읽기 토큰으로 "73% 적중, $1,247 절감"
이라는 반사실만 보여주고, OpenRouter는 "프롬프트의 어디서 캐시가 깨졌는지"를 짚고, Braintrust는
세션당 비용의 중앙값 대비 p99로 이상치를 지목한다. 공통점은 **판정을 발표하지 않고 산수를
보여준다**는 것.
- Helicone: https://docs.helicone.ai/guides/cookbooks/cost-tracking
- OpenRouter Activity: https://openrouter.ai/blog/announcements/activity-dashboard/
- Braintrust: https://www.braintrust.dev/articles/how-to-track-llm-costs-2026

### 🎯 후보 2 (다음 최우선): 상세 페이지 재편 (기능 추가 없이 재배치)

카드 12개를 항상 펼친 채 쌓아 두는 현재 구조는 현행 규범과 어긋난다.

- Grafana는 2026-04 Dynamic Dashboards GA에서 "과도한 세로 스크롤"을 고치려 탭·조건부 렌더링 도입
  (https://grafana.com/whats-new/2026-04-08-dynamic-dashboards-is-now-generally-available/)
- Sentry는 2025-02 이슈 상세를 모두 접히는 섹션 + 스티키 헤더로 전환(정보 위계·점진적 공개)
- Vercel 프로젝트 상세는 탭 구조

제안: **개요 / 에이전트(토큰·모델·캐싱·세션) / 배포(배포·빌드) / 설정(API 키)** 3~4묶음 +
상단에 "지금 이상 있나"를 답하는 한 줄. **API 키 관리는 관제 흐름에서 설정으로 빼야 한다** —
피어 중 자격증명을 모니터링 화면에 두는 곳은 없다.

### 🎯 후보 3: 빈 상태 개선

"아직 목표를 확정하지 않았다" 같은 회색 문장은 다음 행동이 없다. 제목 + 한 문장 + 기본 액션
버튼이 표준(Carbon Design System). 2.2절의 "첫날 1/7"과 직결된다.

### 후보 4 (정리): 도달 불가 화면 처리 방침

11개 화면 파일이 라우트 없이 남아 있다. 지울지 되살릴지 정해야 `graphify` 신호도 정확해진다.

---

## 4. 인계 시 필수 준수 사항 (Hard Constraints)

1. **지식 그래프 선행 조회**: `graphify query "<키워드>"`로 모듈 의존성을 먼저 확인할 것.
2. **세션 내 완결 원칙**: 브랜치 → 구현 → 테스트 → 빌드 → QA → PR/머지까지 한 세션에 완결.
   **단 이번 세션은 이 원칙을 지키지 못했다** — 맨 위 "저장소 상태" 참조.
3. **모듈 경계 무결성**: `ingest`는 타 비즈니스 모듈을 직접 import하지 않고 `EventEmitter2`로만
   소통(`module-boundary.spec.ts` 상시 검증).
4. **강제 중단(Abort) 언급 금지**: PR #68에서 제거됨.
5. **근거 없는 숫자를 만들지 않는다**: 단가·할인율은 `docs/LLM_ECOSYSTEM_GUIDE.md`를 단일 원천으로
   삼고, 출처가 없으면 비워 두거나 비싸게 잡는다. 이번 18번 정정의 핵심 원칙이다.
6. **훅을 고치면 임베딩도 동기화**: `node scripts/sync-embedded-hooks.mjs` (검증은 `--check`).
7. **대화·커밋·PR은 한국어로** 쓴다.
