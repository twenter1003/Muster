# Muster 프로젝트 세션 인수인계서 (Handover Document)

- **작성 일시**: 2026-09-18
- **현재 브랜치**: `main` (최신 커밋 `3cef0f3`, `origin/main`과 100% 동기화됨)
- **작업자 / 모델**: Antigravity (Gemini 2.5 Pro)
- **핵심 상태**:
  - ✅ **전수 테스트**: **729 passed, 729 total (100% All Green)** (API 498개, Web 218개, Connect 13개)
  - ✅ **프로덕션 빌드**: `pnpm -r build` 0 error, 0 warning (API NestJS build 성공, Web Vite 번들링 360ms 완료)
  - ✅ **Cloud Run 원격 배포**: 리비전 `muster-00039-ksh` 배포 완료 (`https://muster-xcswvn6m2q-du.a.run.app`, 헬스체크 200 OK)
  - ✅ **지식 그래프**: `graphify update .` 최신화 동기화 완료 (3,200 노드, 7,821 엣지, 183 커뮤니티)
  - ✅ **QA 증거**: Chrome CDP 기반 데스크톱 & 모바일 29종 스크린샷 캡처 완료

---

## 1. 금일 세션 완료 내역 (PR #67)

### 📊 과제명: 세션별 토큰/비용 낭비 이력 내보내기(Export) 및 캐싱 절감 ROI 시뮬레이션 리포트 다운로드 기능 구축
- **PR 링크**: [#67 (Squash Merged)](https://github.com/twenter1003/Muster/pull/67)
- **주요 커밋**: `5715674` (구현 및 테스트) -> `19cd598` (PR 머지) -> `3cef0f3` (인계 프롬프트 최신화)

#### 1.1 백엔드 (API)
- `apps/api/src/modules/agent-registry/budget.service.ts`:
  - `generateWasteReportJson(projectId)`: 최대 100건의 세션별 낭비 상세 목록, 전체 집계 메트릭, 2026 프론티어 모델의 90% 캐시 읽기 할인율을 적용한 전/후 절감 잠재액(`potential_savings`, `savings_percentage`) 시뮬레이션 엔진 구현.
  - `generateWasteReportCsv(projectId)`: Excel 호환 RFC 4180 및 UTF-8 BOM(`\uFEFF`) 적용, 13개 컬럼의 세션 데이터 행 직렬화 및 최하단 `[SUMMARY]` 요약 행 산출.
- `apps/api/src/modules/agent-registry/agents.controller.ts`:
  - `GET /projects/:id/waste-report.csv`: CSV 스트리밍 다운로드 엔드포인트 (`Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="muster-waste-report-{id}-{date}.csv"`).
  - `GET /projects/:id/waste-report.json`: 구조화 JSON 다운로드 엔드포인트 (`Content-Type: application/json; charset=utf-8`).
- `apps/api/src/modules/agent-registry/agents-report.controller.spec.ts` (신설): 응답 헤더 및 컨트롤러 연동 테스트 2건 작성.
- `apps/api/src/modules/agent-registry/budget.service.spec.ts`: JSON/CSV 직렬화 및 요약 행 산출 단위 테스트 2건 추가.

#### 1.2 프론트엔드 (Web)
- `apps/web/src/lib/exportUtils.ts` (신설):
  - `downloadReportFile(path, defaultFilename)`: 네이티브 `fetch` 기반 Blob 다운로드, RFC 5987 / `Content-Disposition` 파싱, 가상 `<a>` 엘리먼트 생성 및 클릭 트리거, 브라우저/Node 환경 가드 구현.
  - `apps/web/src/lib/exportUtils.spec.ts` (신설): 7건 단위 테스트 전수 통과.
- `apps/web/src/components/TokenWasteIntelligenceCard.tsx` & `.css`:
  - 상단 헤더 우측에 `[📥 CSV 리포트]`, `[📥 JSON]` 버튼 그룹 배치.
  - 클릭 시 마이크로 모션(`transform: scale(0.97)`) 및 다운로드 상태 알림 배너(`exportNotice`) 노출.
- `apps/web/src/components/SessionWasteModal.tsx` & `.css`:
  - 하단 footer 액션바에 `[📥 전체 리포트 (CSV)]`, `[📥 JSON]` 버튼 탑재 및 다운로드 즉각 피드백 연동.
- `apps/web/src/routes/ProjectDetailPage.tsx`:
  - `TokenWasteIntelligenceCard` 및 `SessionWasteModal`에 `projectId={id}` 바인딩.

#### 1.3 QA 검증 및 시각적 증거
- `scripts/qa-server-and-capture.mjs`: 리포트 모의 응답 및 캡처 스텝 추가.
- 신규 스크린샷 3종 확보:
  - `desktop-waste-report-export.png`: 토큰 낭비 인텔리전스 카드 내보내기 버튼 및 실시간 알림 뷰
  - `mobile-waste-report-export.png`: 모바일 반응형 내보내기 버튼 뷰
  - `desktop-modal-waste-report.png`: 세션 상세 모달 하단 CSV/JSON 리포트 액션바 뷰

---

## 2. 코드베이스 구조 및 변경된 파일 요약

```
apps/api/
  ├── src/modules/agent-registry/
  │   ├── budget.service.ts                     # 리포트 생성 엔진 (JSON/CSV)
  │   ├── budget.service.spec.ts                # 서비스 단위 테스트
  │   ├── agents.controller.ts                  # 엔드포인트 연동 (:id/waste-report.csv, .json)
  │   └── agents-report.controller.spec.ts      # [NEW] 컨트롤러 헤더/호출 단위 테스트
apps/web/
  ├── src/lib/
  │   ├── exportUtils.ts                        # [NEW] Blob 다운로드 및 Content-Disposition 파싱
  │   └── exportUtils.spec.ts                   # [NEW] 유틸리티 단위 테스트
  ├── src/components/
  │   ├── TokenWasteIntelligenceCard.tsx        # [CSV/JSON] 버튼 및 알림 배너
  │   ├── TokenWasteIntelligenceCard.css        # 버튼 및 알림 배너 스타일링
  │   ├── TokenWasteIntelligenceCard.spec.ts    # 컴포넌트 단위 테스트
  │   ├── SessionWasteModal.tsx                 # [CSV/JSON] 하단 액션바
  │   ├── SessionWasteModal.css                 # 액션바 스타일링
  │   └── SessionWasteModal.spec.ts             # 모달 단위 테스트
  └── src/routes/
      └── ProjectDetailPage.tsx                # projectId prop 전달
scripts/
  └── qa-server-and-capture.mjs                 # QA 모의 서버 및 29종 스크린샷 캡처
docs/
  ├── kickoff/PROMPT.md                         # 세션 인계 프롬프트 최신화
  └── HANDOVER.md                               # [NEW] 본 인수인계 문서
```

---

## 3. 차기 세션 최우선 착수 과제

### 📊 최근 세션 낭비 탐색기(Session Waste Explorer) 구축: 고낭비 세션 필터(High-Waste/Caution/Normal)·에이전트별/상태별 필터링·검색 및 페이징 고도화

#### 3.1 배경 및 문제의식
- 현재 대시보드의 최근 세션 카드(`recent-runs-card`)는 상위 4개 세션만 고정 노출(`slice(0, 4)`)되고 있어, 세션이 수십 개 이상 누적된 환경에서 실제 비용을 낭비하는 `HIGH_WASTE` 세션만을 추적하거나, 실행 중인(`running`) 세션만을 골라내어 중단(Abort)하기 어렵습니다.

#### 3.2 4인 원팀 확정 설계 명세
1. **PM**:
   - **위험도 탭/칩 필터**: `전체`, `🚨 고낭비(High Waste)`, `⚠️ 주의(Caution)`, `정상(Normal)` 즉시 필터링.
   - **에이전트 및 상태 필터**: 에이전트(`All`, `Claude Code`, `Antigravity`, `Cursor`), 상태(`All`, `실행 중(running)`, `완료(completed)`, `중단(cancelled)`).
   - **실시간 검색**: 세션 ID 앞자리 또는 모델명 인라인 실시간 필터링.
   - **정렬 및 페이지네이션**: 비용순(Cost), 토큰순(Tokens), 최신순(Recent) 정렬 토글 및 5/10/20개 단위 페이징 또는 '더보기' 확장.
   - **원클릭 액션 연동**: 행 클릭 시 `SessionWasteModal` 딥다이브 오픈, `running` 행 인라인 `[중단]` 연동.
2. **백엔드 (API)**:
   - `budget.service.ts`: `dailyUsage` 응답의 `recent_runs` 데이터가 충분한 세션 수(최대 50~100건)와 진단 메트릭(`waste_level`, `wasted_tokens`, `burn_rate`, `model`)을 일관되게 제공하는지 확인 및 보강.
3. **프론트엔드 (Web - Minimalist & Emil Kowalski)**:
   - `apps/web/src/components/SessionWasteExplorer.tsx` 신설 (기존 `ProjectDetailPage` 4개 고정 노출 영역 대체).
   - 반응형 테이블/카드 레이아웃: 데스크톱 테이블 뷰, 모바일 스택 카드 뷰.
   - `SessionWasteExplorer.spec.ts` 단위 테스트 작성.
4. **QA**:
   - 필터링, 정렬, 검색 단위 테스트 통과 확인.
   - `pnpm -r test` (729+ tests) & `pnpm -r build` 무결성 검증.
   - Chrome CDP 기반 데스크톱 & 모바일 스크린샷 캡처 및 지식 그래프 동기화.

#### 3.3 차기 세션 원클릭 실행 런북 (Turn-Key Runbook)
```bash
# 1. 브랜치 생성
git checkout main && git pull origin main
git checkout -b feat/session-waste-explorer

# 2. 구현 및 단위 테스트
pnpm --filter @muster/web test
pnpm -r test

# 3. 전수 검증 및 빌드
pnpm format && pnpm -r test && pnpm -r build

# 4. QA 스크린샷 캡처
node scripts/qa-server-and-capture.mjs

# 5. 지식 그래프 최신화
graphify update .

# 6. PR 생성 및 CI 통과 후 머지
git push origin feat/session-waste-explorer
gh pr create --title "feat(web): 세션 낭비 탐색기(Session Waste Explorer) 및 고낭비 필터링/검색 구축" ...
gh pr checks <PR_NO> --watch
gh pr merge <PR_NO> --squash --delete-branch
git checkout main && git pull origin main
```

---

## 4. 인계 시 필수 준수 사항

1. **지식 그래프 선행 조회**: 세션 시작 시 항상 `graphify query "<키워드>"`로 모듈 의존성을 먼저 확인할 것.
2. **세션 내 완결 원칙**: 브랜치 생성부터 구현, 테스트/빌드, QA 스크린샷, PR 머지, `main` 동기화, `PROMPT.md` 갱신까지 한 세션 안에서 끝낼 것.
3. **Excel 호환 및 다크 테마 일관성**: CSV는 UTF-8 BOM(`\uFEFF`) 및 RFC 4180을 반드시 준수하고, UI는 Emil Kowalski & 다크 글래스모피즘 톤앤매너를 유지할 것.
