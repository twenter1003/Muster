# AgentOps

Claude Code/LLM 기반 프로젝트들을 하나의 페이지에서 생성·구성·관리·모니터링하는 통합 관리 플랫폼.

**요구사항 원천**: `AgentOps_통합설계서_v2.0.md` (레포 루트) — 유일한 원천.
이전 4개 문서(PRD v1.5 / TechSpec v1.3 / API v1.1 / ERD v1.0)는 **폐기**되었으므로 참조하지 않는다.
문서 내부 충돌 시 우선순위: **Part 4(API) > Part 2(기술 사양) > Part 1(PRD)**

---

## 폴더 구조

```
AgentOps/
├── docker-compose.yml          # 로컬 개발 환경 (api + postgres 16)
├── pnpm-workspace.yaml         # pnpm 모노레포
├── apps/
│   ├── api/                    # NestJS 백엔드 (배포 단위 1개 = Cloud Run 서비스 1개)
│   │   ├── Dockerfile          # development / build / production 멀티스테이지
│   │   ├── tsconfig.json       # 편집기·타입체크용 (test 포함)
│   │   ├── tsconfig.build.json # nest build 전용 (test·spec 제외)
│   │   ├── test/               # e2e 테스트
│   │   └── src/
│   │       ├── main.ts         # 부트스트랩 (globalPrefix=api/v1, ValidationPipe)
│   │       ├── app.module.ts   # 7개 모듈 + ConfigModule + EventEmitterModule 조립
│   │       ├── config/
│   │       │   └── env.schema.ts   # Zod 환경변수 검증 (실패 시 부팅 차단)
│   │       ├── database/           # 데이터 접근 레이어
│   │       │   ├── entities/       # 17개 엔티티 + enum 값 집합
│   │       │   ├── migrations/     # 스키마 변경 이력 (synchronize는 항상 off)
│   │       │   ├── data-source.ts  # 런타임·CLI 공용 접속 설정
│   │       │   └── database.module.ts
│   │       ├── common/             # 공통 레이어 (@Global)
│   │       │   ├── errors/         # Part 4 1장 에러 포맷
│   │       │   ├── pagination/     # 커서 기반 페이지네이션 유틸
│   │       │   ├── auth/           # 전역 인증 가드 뼈대
│   │       │   ├── events/         # 모듈 간 이벤트 계약 (Part 2 8장)
│   │       │   └── health/         # Cloud Run 기동 확인
│   │       └── modules/            # Part 2 2장의 7개 모듈 경계
│   │           ├── auth/           # Part1 3.6 / Part4 2장  → Phase 3
│   │           ├── project-core/   # Part1 3.5 / Part4 3장  → Phase 3
│   │           ├── doc-store/      # Part1 3.1 / Part4 4장  → Phase 4
│   │           ├── agent-registry/ # Part1 3.3 / Part4 6장  → Phase 4
│   │           ├── env-catalog/    # Part1 3.2 / Part4 5장  → Phase 5
│   │           ├── ingest/         # Part1 3.4 / Part4 7.1  → Phase 6
│   │           └── realtime/       # Part1 3.4 / Part4 7.3  → Phase 6
│   └── web/                    # React + Vite (최소 프론트, /api 프록시)
```

### 공통 레이어 설계 메모

- **에러 포맷** — 모든 응답은 `{ error: { code, message } }`. `AllExceptionsFilter`가 전역으로 걸려
  Nest 기본 예외·ValidationPipe 메시지·미처리 예외까지 이 형태로 번역한다.
  500번대는 원인 문자열을 클라이언트에 노출하지 않고 로그에만 남긴다.
  `code` 값 집합은 설계 문서에 없어 `common/errors/error-codes.ts`에서 확정했다.
- **커서 페이지네이션** — OFFSET이 아닌 키셋 방식. 커서는 `{ts,id}`를 base64url로 감싼 불투명
  문자열이며, `buildPage()`는 `limit+1`개를 받아 다음 페이지 유무를 count 쿼리 없이 판정한다.
- **인증 가드** — `AuthGuard`가 전역 등록되어 **기본 차단**이고, `@Public()`으로만 예외를 연다
  (OAuth 로그인/콜백, GitHub 웹훅). 토큰→사용자 해석은 `SessionResolver` 인터페이스 뒤에 있고
  Phase 1은 아무것도 통과시키지 않는 `NullSessionResolver`가 바인딩되어 있다.

### 모듈 경계 강제 (지시서 원칙 4 / Part 2 8장)

Ingest는 다른 모듈을 직접 호출하지 않고 `common/events/domain-events.ts`의 이벤트만 발행한다.
이 규칙은 문서로만 두지 않고 **두 겹으로 강제**한다:

1. ESLint `no-restricted-imports` (`.eslintrc.js`의 ingest 전용 override)
2. `src/modules/ingest/module-boundary.spec.ts` — 린트를 건너뛴 머지도 테스트가 잡는다

이벤트 계약을 `common`에 둔 이유: 발행자(Ingest)와 구독자(Realtime)가 서로를 import하지 않게 하고,
Ingest를 별도 서비스로 분리할 때 이 파일이 그대로 메시지 스키마가 되게 하기 위함이다.

---

## 로컬 실행

```bash
pnpm install
docker compose up -d --build     # api(:8080) + postgres(:5432)
curl http://localhost:8080/api/v1/health
```

`apps/api/src`는 볼륨 마운트되어 있어 컨테이너 재빌드 없이 핫리로드된다.

컨테이너 없이 돌리려면:

```bash
pnpm dev:api    # :8080
pnpm dev:web    # :5173 (/api → :8080 프록시)
```

## 테스트

```bash
pnpm --filter @agentops/api test:cov    # 단위 테스트 + 커버리지
pnpm --filter @agentops/api test:e2e    # e2e (DB 필요 — 아래 마이그레이션 선행)
pnpm lint
```

## 마이그레이션

```bash
docker compose up -d db
cd apps/api
pnpm migration:run          # 적용
pnpm migration:show         # 적용 현황
pnpm migration:revert       # 마지막 1개 되돌리기
pnpm migration:generate src/database/migrations/<이름>   # 엔티티 변경분으로 생성
```

`synchronize`는 어떤 환경에서도 켜지 않는다 — 스키마 변경은 전부 마이그레이션 파일로 남아야
리뷰와 롤백이 가능하다. 생성된 SQL은 항상 사람이 검토한다 (TypeORM 선택 시 감수하기로 한 부분).

---

## 배포 제약 (Phase 1 결정)

Realtime의 SSE는 인프로세스 EventEmitter2 이벤트를 구독한다. 인프로세스 이벤트는 인스턴스 간
전달되지 않으므로, 인스턴스 A가 수신한 웹훅이 인스턴스 B에 붙은 SSE 클라이언트에 도달하지 않는다.
따라서 **Cloud Run은 `max-instances=1`로 고정**한다 (Phase 7 배포 설정에 반영).
이 제약을 풀어야 할 시점에는 Part 2 8장이 예고한 대로 이벤트 발행부를 Pub/Sub으로 교체한다.
