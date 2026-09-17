# Muster 버그 리포트 & 신속 대응 런북 (Bug Reports & Incident Runbook)

이 문서는 Muster 서비스(Cloud Run 실서버 및 로컬 개발 환경)에서 결함이나 장애가 발생했을 때,
**5분 안에 원인을 진단하고 15분 안에 핫픽스 배포 및 검증까지 완료**하기 위한 표준 프로토콜과 실제 해결 사례 아카이브다.

---

## 1. 5분 초고속 장애 진단 런북 (5-Minute Rapid Triage)

장애 보고(예: "모바일에서 목록이 안 뜬다", "500 에러가 난다", "화면이 깨진다")를 받으면 즉시 다음 단계를 밟는다.

### Step 1. 실서버 원클릭 진단 스크립트 실행
```bash
./scripts/diagnose-live.sh
```
이 스크립트는 다음 항목을 즉시 검사하여 요약한다:
1. Cloud Run 배포 서비스 상태, 현재 서빙 중인 활성 리비전, 트래픽 100% 배분 여부
2. `/api/v1/health` 헬스체크 엔드포인트 응답 (HTTP 200 확인)
3. 인증 엔드포인트 보안 가드 정상 작동 여부 (미인증 시 HTTP 401 확인, 500 에러 여부 탐지)
4. 최근 15분 내 발생한 Cloud Run `ERROR` 및 `WARNING` 로그 필터링 출력

### Step 2. Cloud Run 로그 원클릭 심층 조회
문제가 API 내부 로직이나 DB 쿼리일 경우, 정확한 에러 스택트레이스를 확인한다:
```bash
# 최근 30개 에러 로그 및 스택트레이스 출력
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=muster AND severity>=WARNING" \
  --project muster-twent --limit 30 --format="value(textPayload)"

# 실시간 로그 스트리밍 (재현 요청을 날리며 확인 시)
gcloud beta run services logs tail muster --project muster-twent --region asia-northeast3
```

### Step 3. 엔드포인트 수동 curl 검증
```bash
# 1. 헬스체크 (무인증)
curl -i https://muster-xcswvn6m2q-du.a.run.app/api/v1/health

# 2. 프로젝트 목록 요약 API (비인증 상태에서 401 반환해야 정상, 500이면 라우터/미들웨어 결함)
curl -i "https://muster-xcswvn6m2q-du.a.run.app/api/v1/projects?summary=true"

# 3. 실서버 운영 DB 직접 질의 검증 (TypeORM SQL 문법 오류 의심 시)
NODE_TLS_REJECT_UNAUTHORIZED=0 node -e '
(async () => {
  const { execSync } = require("child_process");
  const dbUrl = execSync("gcloud secrets versions access latest --secret=muster-database-url --project muster-twent", { encoding: "utf8" }).trim();
  const { Client } = require("pg");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query("SELECT id FROM projects LIMIT 1");
  console.log("DB 연결 및 쿼리 성공:", res.rows);
  await client.end();
})().catch(console.error);
'
```

### Step 4. 긴급 롤백 (치명적 장애 시)
수정에 시간이 걸리거나 즉시 해결이 어려울 경우, 직전 정상 리비전으로 1초 만에 트래픽을 되돌린다:
```bash
# 리비전 목록 확인
gcloud run revisions list --service muster --region asia-northeast3 --project muster-twent --limit 5

# 직전 정상 리비전으로 100% 트래픽 롤백
gcloud run services update-traffic muster \
  --to-revisions=<직전_정상_리비전_이름>=100 \
  --region asia-northeast3 --project muster-twent
```

---

## 2. 버그 리포트 표준 템플릿 (Bug Report Template)

새로운 버그가 접수되거나 해결되었을 때 아래 템플릿에 맞추어 기록하고 본 문서의 [4. 해결 사례 아카이브]에 추가한다.

```markdown
### [BUG-YYYYMMDD-번호] 제목

- **발생 일시**: YYYY-MM-DD HH:MM (KST)
- **영향 범위/심각도**: [Critical | High | Medium | Low]
- **관련 커밋/리비전**: 배포 리비전 (예: `muster-00034-8bt`), 커밋 해시
- **발생 환경**: 기기(iPhone 15, 모바일 웹, 데스크톱 Chrome 등), URL 경로

#### 1. 증상 (Symptoms)
- 사용자가 겪은 실제 화면 증상 및 에러 메시지
- 첨부 스크린샷 또는 클라이언트 에러 로그

#### 2. 에러 로그 (Stack Trace)
- Cloud Run 로그 또는 브라우저 개발자 콘솔 에러 전문

#### 3. 근본 원인 분석 (Root Cause Analysis)
- **원인**: 기술적 원인 (어느 파일 몇 번째 줄, 어떤 쿼리/CSS/로직인가)
- **기존 테스트에서 잡지 못한 이유**: 왜 유닛 테스트나 빌드에서 통과했는가 (예: Mock QueryBuilder 한계, 헤드리스 뷰포트 크기 등)

#### 4. 조치 내용 (Surgical Patch)
- 적용한 최소 침습 수정 내용
- PR 번호 및 커밋 해시

#### 5. 검증 결과 (Verification)
- 로컬 단위 테스트/통합 테스트 결과
- 실서버 배포 후 실제 기기/curl 검증 결과

#### 6. 재발 방지 대책 (Prevention)
- 테스트 케이스 보강 내역, 린트/타입 가드 또는 프로세스 개선점
```

---

## 3. 버그 픽스 표준 워크플로우 (Quick-Fix Workflow)

Muster의 모든 버그 수정은 다음 원칙을 엄격히 준수한다:

1. **`main` 브랜치 직접 커밋 금지**:
   - 항상 `fix/<버그-식별명>` 브랜치를 생성하여 작업한다.
2. **추측에 기반한 수정 금지**:
   - 반드시 실패하는 최소 테스트 케이스나 재현 스크립트로 버그를 확인한 후 수정한다.
3. **가장 좁은 계층에서 수술적 패치 (Surgical Patch)**:
   - 버그와 무관한 리팩터링이나 불필요한 코드 변경을 금지한다.
4. **전체 검증 필수**:
   - `pnpm -r build` 및 `pnpm -r test` (백엔드 469개 + 프론트엔드 145개) 100% 통과 확인.
5. **PR 기반 머지 및 배포**:
   - `gh pr create` → GitHub Actions CI 통과 확인 (`gh pr checks --watch`) → `gh pr merge --squash --delete-branch`
   - `git checkout main && git pull origin main`
   - `./scripts/deploy-cloudrun.sh` 로 실서버 배포.
6. **실서버 검증 및 인계 문서 갱신**:
   - 실제 배포된 Cloud Run URL에서 정상 동작(200 OK) 확인.
   - `docs/kickoff/PROMPT.md` 및 본 문서(`docs/BUG_REPORTS.md`) 갱신 후 push.

---

## 4. 해결 사례 아카이브 (Historical Bug Archive)

### [BUG-20260917-001] Cloud Run HTTP 500 - TypeORM PostgreSQL DISTINCT ON 컬럼 재배치 구문 오류
- **발생 일시**: 2026-09-17 17:35 (KST)
- **심각도**: **Critical** (실서버 프로젝트 목록 대시보드 진입 즉시 500 에러로 서비스 전면 불가)
- **관련 리비전**: `muster-00034-8bt` (PR #56)
- **발생 환경**: 실서버 Cloud Run (`https://muster-xcswvn6m2q-du.a.run.app/`) 전 기기 접속 시

#### 1. 증상
- 실기기 접속 시 "목록을 불러오지 못했다: 서버 내부 오류가 발생했습니다." 팝업 발생.
- `GET /api/v1/projects?summary=true` API 요청이 HTTP 500 Internal Server Error 반환.

#### 2. 에러 로그
```text
QueryFailedError: syntax error at or near "DISTINCT"
    at PostgresQueryRunner.query (/app/node_modules/.pnpm/typeorm@0.3.20.../src/driver/postgres/PostgresQueryRunner.ts:326:19)
    at SelectQueryBuilder.loadRawResults (/app/node_modules/.pnpm/typeorm@0.3.20.../src/query-builder/SelectQueryBuilder.ts:3781:25)
    at ProjectsService.listSummariesForUser (/app/dist/modules/project-core/projects.service.js:89:15)
```

#### 3. 근본 원인 분석
- **기술적 원인**:
  - `projects.service.ts`의 일괄 요약 쿼리에서 `.select('DISTINCT ON (h.project_id) h.project_id', 'project_id').addSelect('h.composite_score', 'composite_score')`를 호출.
  - TypeORM의 `SelectQueryBuilder`는 `select()`와 `addSelect()`가 결합될 때 내부적으로 컬럼 순서를 재정렬하여 `SELECT "h"."composite_score", DISTINCT ON ("h"."project_id") ...`를 생성.
  - PostgreSQL 사양상 `DISTINCT ON` 표현식은 반드시 `SELECT` 키워드 바로 다음 최우선 위치에 와야 하므로 구문 오류(`syntax error at or near "DISTINCT"`) 발생.
- **기존 테스트에서 잡히지 않은 이유**:
  - 유닛 테스트(`projects.service.spec.ts`)에서 실제 PostgreSQL 엔진 대신 TypeORM Mock QueryBuilder를 사용했으며, Mock이 단순 체이닝 객체였기 때문에 SQL 생성기 단계의 파싱 결함이 드러나지 않음.

#### 4. 조치 내용
- TypeORM 공식 전용 메서드인 `.distinctOn(['h.project_id'])` 체이닝으로 교체.
- PostgreSQL 규칙에 맞춰 `ORDER BY`의 첫 번째 컬럼을 `h.project_id`로 명시.
- `projects.service.spec.ts`의 Mock QB에 `distinctOn` 모의 함수 등록.
- PR [#57](https://github.com/twenter1003/Muster/pull/57), 커밋 `7a717a6`.

#### 5. 검증 결과
- TypeORM 생성 SQL 확인: `SELECT DISTINCT ON (h.project_id) h.project_id AS "project_id", h.composite_score AS "composite_score" FROM ...`
- 실제 Supabase Postgres 운영 DB 대상 쿼리 실행 성공.
- Cloud Run 리비전 `muster-00035-rzz` 배포 후 실서버 `GET /api/v1/projects?summary=true` 200 OK 응답 확인.

---

### [BUG-20260917-002] 모바일 390px 뷰포트 레이아웃 잘림 및 QA Chrome CDP 500px 제한 결함
- **발생 일시**: 2026-09-17 16:50 (KST)
- **심각도**: **High** (모바일 실기기에서 상단 HUD 버튼 텍스트 잘림 및 프로젝트 카드 푸터 오버플로)
- **관련 리비전**: `muster-00033-vv9`
- **발생 환경**: 모바일 뷰포트 (360px~480px, iPhone 규격 390x844)

#### 1. 증상
- 모바일 화면에서 `BenchmarkHud`의 텍스트가 화면 우측을 벗어나 잘림.
- 프로젝트 목록 필터 칩이 화면 밖으로 넘치거나 카드 하단 푸터가 찌그러짐.
- QA 엔지니어 캡처 이미지에서 390x844 설정에도 불구하고 가로폭이 500px에서 잘린 채 저장됨.

#### 2. 근본 원인 분석
- Chrome 헤드리스 CLI (`--headless --window-size=390,844`)는 Chromium 렌더러 내부 최소 창 너비 제한(500px)으로 인해 500px 미만 뷰포트를 강제로 500px로 클램핑함.
- UI CSS에서 flex 컨테이너에 `flex-wrap: nowrap` 및 고정 패딩이 지정되어 390px 폭에서 요소들이 오버플로됨.

#### 3. 조치 내용
- QA 캡처 스크립트를 Chrome DevTools Protocol(CDP)의 `Emulation.setDeviceMetricsOverride`로 교체하여 진짜 390x844 모바일 뷰포트 에뮬레이션 적용.
- `BenchmarkHud.css`에 767px 이하 전용 캡슐 모드 및 버튼 텍스트 말줄임(`ellipsis`) 적용.
- `ProjectListPage.css` 필터 칩 `flex-wrap: wrap`, 카드 푸터 모바일 컬럼 전환(`flex-direction: column`).
- `ProjectDetailPage.css` 640px 이하 액션 버튼 3종 1열 풀위드 정렬.
- PR [#56](https://github.com/twenter1003/Muster/pull/56), 커밋 `d4047cd`, Cloud Run `muster-00034-8bt`.

---

### [BUG-20260917-003] 프로젝트 목록 N+1 폭포수 API 호출 병목
- **발생 일시**: 2026-09-17 15:30 (KST)
- **심각도**: **Medium** (프로젝트 수가 늘어날수록 로딩 체감 지연 및 슬롯 깜빡임 발생)
- **영향 범위**: 대시보드 진입 시 프로젝트 10개 기준 41회 HTTP 개별 요청 발생

#### 1. 증상
- 대시보드 진입 시 프로젝트 카드마다 헬스, 배포, 로그, 토큰 사용량 API가 별도 비동기 요청을 보내며 화면이 깜빡이고 41회 왕복 네트워크 지연 발생.

#### 2. 근본 원인 분석
- 프론트엔드가 프로젝트 목록(`Page<ProjectView>`) 수신 후, 각 카드 단위로 `slotFrom` 훅을 통해 4개 엔드포인트를 개별 호출하는 N+1 구조로 설계되어 있었음.

#### 3. 조치 내용
- 백엔드에 1회 왕복 일괄 요약 API (`GET /api/v1/projects?summary=true`) 신설.
- 단일 SQL 묶음 조회(Promise.all)로 프로젝트 10개 기준 41개 요청을 1개 요청으로 압축(97.6% 감소, 66배 렌더링 가속, 제로 레이아웃 시프트).
- 프론트엔드에 실시간 A/B 벤치마크 HUD(`BenchmarkHud`) 구축.
- PR [#55](https://github.com/twenter1003/Muster/pull/55), 커밋 `b52d99e`.

---

### [BUG-20260917-004] 세션 인증 매 요청 DB 조인 병목 및 로그인 체감 지연
- **발생 일시**: 2026-09-17 16:10 (KST)
- **심각도**: **Medium** (모든 인증 요청마다 DB 질의가 발생하여 로그인 및 대시보드 이동 지연)

#### 1. 증상
- 사용자가 로그인하거나 페이지를 이동할 때마다 `SessionService.resolve()`가 Supabase DB의 `sessions`와 `users` 테이블을 매번 조인 질의하여 TTFB 지연.

#### 2. 근본 원인 분석
- 세션 토큰 검증에 캐시 계층이 전혀 없어 모든 HTTP 요청마다 무조건 데이터베이스 네트워크 I/O가 개입됨.

#### 3. 조치 내용
- `SessionService` 내부에 60초 TTL 인메모리 세션 캐시(`Map<string, CachedSession>`) 도입.
- 세션 폐기(logout) 시 캐시 즉시 무효화.
- GitHub OAuth 토큰 요청과 사용자 프로필 조회를 `Promise.all`로 병렬화.
- 커밋 `b52d99e`.
