# AgentOps 프로젝트 관리 플랫폼 — 통합 설계서

**버전**: v2.1 (통합본)
**작성일**: 2026-09-07
**구성**: PRD v1.6 + 기술 사양서 v1.5 + 데이터 모델 v1.2 + API 설계 v1.3
**변경**: 2차 설계 검토 반영 — 엔티티 19개로 확정(WEBHOOK_DELIVERIES·DEPLOYMENT_EVENTS·PROJECT_API_KEYS 신설), enum 전체 정의, 타입·유니크·FK 정책 명시, DORA 등급 구간 확정, 로그·실행이력 쓰기 경로 신설

> 내용 충돌 시 **Part 4(API) > Part 2(기술 사양) > Part 1(PRD)** 순으로 우선한다.

---

# Part 1. 제품 요구사항 (PRD)

## 1. 개요

### 1.1 배경
Claude Code 및 LLM을 활용해 다수의 프로젝트를 병행 진행하는 과정에서, 프로젝트별 기획 문서·개발 환경·에이전트 설정·진행 상황이 분산 관리되고 있다. 프로젝트 수가 늘어날수록 이 분산 관리 비용이 커지므로, 이를 통합 관리하는 단일 플랫폼이 필요하다.

### 1.2 목적
Claude Code/LLM 기반 프로젝트들을 하나의 페이지에서 생성·구성·관리·모니터링할 수 있는 통합 관리 플랫폼(AgentOps)을 구축한다.

### 1.3 범위
본 PRD는 AgentOps 플랫폼의 MVP 기능 요구사항과 이를 뒷받침하는 비기능 요구사항을 정의한다. 개별 프로젝트(예: 사용자가 관리하는 각 서브 프로젝트) 자체의 요구사항은 범위에 포함하지 않는다.

---

## 2. 사용자 및 이해관계자

| 구분 | 설명 |
|---|---|
| 1차 사용자 (MVP) | 플랫폼 소유자 본인 — Claude Code/LLM으로 여러 프로젝트를 병행하는 1인 개발자 |
| 2차 사용자 (확장 단계) | 플랫폼에 초대되는 협업자 — 동일 프로젝트를 함께 관리하는 팀원 |

MVP는 1인 사용을 기준으로 하되, 모든 설계는 멀티유저 확장을 전제로 한다 (요구사항 3.6, 데이터 모델의 PROJECT_MEMBERS 참조).

---

## 3. 기능 요구사항

각 항목은 **MVP 포함 여부**와 **관련 모듈**을 함께 표기한다.

### 3.1 문서 관리 (DocStore)
- 프로젝트별 기획·설계 문서(PRD, SRS, 기술 사양서 등)를 저장·정리한다.
- 문서는 타입(기획/설계/기타)으로 분류되며, 관련 Git 커밋 참조와 연결될 수 있다.
- **MVP 포함**

### 3.2 개발환경·기술스택 시각화 (EnvCatalog)
- 프로젝트별 기술스택 구성을 리스트 또는 폴더 구조로 시각화한다.
- 자주 쓰는 스택 조합을 템플릿/프리셋으로 저장하고, 새 프로젝트 생성 시 적용할 수 있다.
- 템플릿 적용 시 도커 환경을 자동 구축할 수 있다:
  - 사용자가 UI 폼 또는 자연어 입력란을 통해 기술스택을 지정
  - 지정된 값을 LLM에 전달하여 Dockerfile/docker-compose 설정을 생성
  - 생성된 설정은 **자동 정책 검사(Policy Gate)**를 통과해야 사람에게 승인 요청이 노출됨 (3.2.1 참조)
  - 사람이 승인하면 표준 `docker build/run` 명령으로 실행
- **MVP 포함**

#### 3.2.1 도커 설정 안전장치 (Policy Gate)
- LLM이 생성한 도커 설정은 실행 전 자동 정책 검사를 거친다. 정책 위반(예: privileged 모드, 호스트 전체 마운트, 리소스 제한 누락, 비신뢰 이미지)이 발견되면 사람의 승인 여부와 무관하게 원천 차단한다.
- 사람 승인 단계에서는 설정 diff와 함께, 사용자가 도커 지식이 부족해도 이해할 수 있도록 자연어 위험도 설명을 함께 제시한다.
- **근거**: 사용자가 관련 지식이 부족해 위험한 설정을 그대로 승인할 가능성이 있으므로, 승인 절차만으로는 안전을 보장할 수 없다는 요구사항에 따름.
- **MVP 포함 (필수)**

### 3.3 에이전트 관리 (AgentRegistry)
- 프로젝트별 에이전트 설정(md 파일)을 관리(작성/수정/버전 관리)한다.
- 에이전트 실행 이력(AGENT_RUNS)을 통해 토큰 사용량·비용·상태를 대시보드로 표시한다.
- 프로젝트별 토큰/비용 예산을 설정하고, 초과 시 알림을 제공한다.
- **MVP 범위**: md 파일 관리, 실행 이력 표시, 예산 알림까지 포함. 멀티에이전트 오케스트레이션(에이전트 간 자동 위임·재시도·상태 머신)은 **MVP 제외** (8장 참조).

### 3.4 진행상황·에러 로그 시각화 (Ingest / Realtime)
- 프로젝트의 에러 로그, 실행 로그를 수집하여 시각화한다.
- 프로젝트의 진행 단계(예: 기획 → 개발 → 테스트 → 배포) 전환 이력을 타임라인으로 시각화한다.
- 프로젝트 헬스 스코어를 시계열로 추적하고 대시보드에 표시한다. 산출식은 DORA 4대 지표(배포 빈도, 변경 리드타임, 변경 실패율, 서비스 복구 시간) 각각의 실측값을 DORA의 Elite/High/Medium/Low 등급 구간에 매핑해 1~4점을 부여한 뒤 평균하는 방식을 채택한다 (임의 가중치가 아닌 DORA 실증 벤치마크 기반). 1인 사이드 프로젝트 특성을 반영해 등급 구간은 완화 적용한다. 실시간 대시보드 표시 지표는 SRE Golden Signals(지연시간·트래픽·에러율·포화도)를 채택한다.
- 대시보드는 실시간(SSE 기반)으로 갱신된다. 그 외 문서·환경 관리 등은 사용자가 직접 조작하는 방식으로 충분하다.
- **MVP 포함**

### 3.5 프로젝트 CRUD (ProjectCore)
- 프로젝트 생성·조회·수정·삭제를 지원한다.
- 프로젝트는 GitHub 저장소와 연동되며, 웹훅을 통해 커밋/PR 이벤트를 수신한다.
- **MVP 포함**

### 3.6 접근 제어 및 협업 (Auth) — 확장 단계
- MVP 단계에서는 단일 사용자(소유자) 인증만 지원한다.
- 확장 단계에서 프로젝트 단위로 협업자를 초대하고 역할(owner/member 등)을 부여할 수 있다.
- 모든 사용자 행위는 감사 로그(AUDIT_LOGS)에 기록된다 — 이 기록 체계는 MVP 단계부터 구축한다.
- **MVP 포함 범위**: 감사 로그 테이블/기록 체계. **확장 단계**: 다중 사용자 초대·권한 관리 UI.

---

## 4. 비기능 요구사항

| 항목 | 요구사항 |
|---|---|
| 확장성 | 관리 대상 프로젝트 수가 지속적으로 증가하는 것을 전제로 설계 (모듈러 모놀리식 구조로 특정 모듈만 향후 분리 가능하게) |
| 실시간성 | 대시보드(진행상황/로그/헬스 스코어)는 실시간 갱신, 그 외 기능은 준실시간(사용자 조작 기반)으로 충분 |
| 멀티유저 대비 | 1인 사용으로 시작하되 데이터 모델·인증 구조는 멀티유저 전환 시 스키마 변경 없이 확장 가능해야 함 |
| 안전성 | 자동화된 인프라 구축(도커 환경) 기능은 반드시 자동 정책 검사를 거쳐야 하며, 사람의 승인만으로 위험을 통제하지 않음 |
| 운영 지향 | 관리 대상 프로젝트들이 최종적으로 배포·서비스 운영까지 가는 것을 전제로 하며, 플랫폼 자체도 Ops 환경 구축을 지향 |

---

## 5. 시스템 아키텍처 개요

- **전체 구조**: 모듈러 모놀리식 (배포는 단일, 내부는 Auth / ProjectCore / DocStore / EnvCatalog / AgentRegistry / Ingest / Realtime 모듈로 분리)
- **백엔드**: NestJS 단일 스택. AgentRegistry 모듈은 향후 실제 멀티에이전트 오케스트레이션(레벨 3) 요구사항이 발생하면 Python으로 분리 검토
- **저장소**: PostgreSQL 단일. 로그(LOG_ENTRIES) 조회 성능 저하 시 TimescaleDB 확장 적용 검토
- **프로젝트 연동**: GitHub 연동(웹훅 + API) 중심. 로컬 파일시스템 직접 읽기는 개발 단계 임시 어댑터로만 사용
- **실시간 전달**: SSE (Server-Sent Events)
- **배포 대상**: GCP Cloud Run + Cloud SQL (플랫폼 자체 호스팅) — ECS Fargate는 상시 과금 구조라 1인 개발 단계 비용 부담이 커, 요청 기반으로 0까지 스케일되는 Cloud Run으로 최종 확정
  - 참고: 관리 대상 프로젝트의 도커 환경을 어디서 실행할지는 우리 플랫폼의 배포 결정이 아니라 EnvCatalog 모듈의 기능 구현 세부사항이다. 이는 해당 모듈을 실제로 설계·구현하는 시점에 별도로 결정한다 (3.2절 기능 요구사항 참조).
- **도커 자동 구축 파이프라인**: LLM 설정 생성 → 자동 정책 검사(Policy Gate: Trivy + Conftest/OPA 조합 — 둘 다 Go 바이너리로 NestJS 파이프라인에 Python 의존성을 새로 끌어들이지 않음. Trivy가 표준 취약점·설정 오류를, Conftest가 서비스 특화 규칙을 담당) → 사람 승인(위험도 자연어 설명 포함) → 표준 도커 명령 실행

상세 데이터 모델(12개 이상 엔티티)은 별도 기술 사양서에서 다룬다.

---

## 6. 우선순위 (MVP vs 이후 단계)

### MVP (1차 출시)
- 문서 관리, 프로젝트 CRUD, 개발환경 시각화 + 템플릿, 도커 자동 구축(Policy Gate 포함), 에이전트 md 관리 + 실행 대시보드, 로그/진행단계/헬스 스코어 시각화, 감사 로그 기록 체계

### 확장 단계 (2차)
- 다중 사용자 초대·권한 관리 UI
- 멀티에이전트 오케스트레이션 (AgentRegistry Python 분리)
- 필요시 웹훅 원본 로그 별도 저장

---

## 7. 성공 지표

국제표준을 참고해 층위별로 지표를 구분한다.

| 층위 | 참고 표준 | 지표 |
|---|---|---|
| 프로젝트 헬스 스코어 | DORA 4대 지표 | 배포 빈도, 변경 리드타임, 변경 실패율, 서비스 복구 시간(MTTR)을 각각 DORA 등급 구간에 매핑해 평균 |
| 실시간 대시보드 | SRE Golden Signals | 지연시간, 트래픽, 에러율, 포화도 |
| 플랫폼 자체 품질 목표 | ISO/IEC 25010 | 기능적합성·신뢰성·보안성·유지보수성 등 8개 품질 특성을 품질 체크리스트로 참고 (직접적 수치 지표는 아님) |
| 플랫폼 운영 지표 (제안) | — | 도커 환경 자동 구축 성공률(정책 검사 통과율), 프로젝트 등록부터 첫 상태 확인까지 걸리는 시간 |

DORA 등급 매핑의 구체적 구간 완화 수치는 11장 미해결 사항 참조.

---

## 8. 범위 제외 (Out of Scope, MVP 기준)

- 실제 멀티에이전트 오케스트레이션 (상태 머신 기반 에이전트 간 자동 위임/재시도)
- Slack/Discord 등 알림 채널 다중화
- AI 기반 자동 요약/다음 작업 추천
- 다중 사용자 권한 관리 UI (감사 로그 기록 체계 자체는 MVP 포함)
- 웹훅 원본 페이로드 별도 저장 (계획에서 완전히 제외)

---

## 9. 전제 및 종속성 (Assumptions & Dependencies)

- 관리 대상 프로젝트는 GitHub 저장소를 사용한다고 가정한다 (타 Git 호스팅 지원은 범위 외).
- 관리 대상 프로젝트는 도커 기반으로 개발 환경을 구성할 수 있는 구조라고 가정한다.
- LLM(Claude API) 호출이 가능한 환경(API 키/네트워크 접근)을 전제로 한다.

## 10. 리스크

| 리스크 | 설명 | 완화 방향 |
|---|---|---|
| 정책 게이트의 룰 커버리지 한계 | 자동 정책 검사가 모든 위험 패턴을 포괄하지 못할 수 있음 | 초기엔 검증된 오픈소스 보안 스캔 도구 기반으로 시작하고, 실사용 중 발견되는 위험 패턴을 룰에 지속 추가 |
| LLM 생성 도커 설정의 신뢰도 | 초기 단계에서 LLM이 생성한 설정의 실패율(빌드 오류, 의도와 다른 구성)이 높을 수 있음 | 정책 게이트 통과율/재시도율을 지표로 추적 (7장 성공 지표 후보) |
| 로그 데이터 증가 속도 예측 불가 | 프로젝트 수 증가에 따라 LOG_ENTRIES 등 데이터 증가 속도가 예상보다 빠를 수 있음 | PostgreSQL 단일 구조로 시작하되 TimescaleDB 전환 트리거(조회 지연 임계치)를 조기에 설정 |

## 11. 미해결 사항 (Open Questions)

> 검토 과정에서 확인이 필요한 항목.

1. (플랫폼 배포와는 별개로) EnvCatalog 모듈의 도커 실행 인프라는 해당 모듈 설계 시점에 결정 — 후보로 단일 VM+Docker 데몬, GKE 등을 그때 다시 비교

---

# Part 2. 기술 사양

## 1. 문서 개요

본 문서는 PRD v1.5의 기능·비기능 요구사항을 실제로 구현하기 위한 아키텍처, 데이터 모델, 배포 구조, 보안 설계를 정의한다. PRD가 "무엇을, 왜"를 다뤘다면 본 문서는 "어떻게"를 다룬다. 데이터 모델은 PRD 확정 이후 파생된 모든 요구사항(멀티유저 대비, 진행 단계 이력, 헬스 스코어 산출 방식 등)을 반영해 전면 재설계했다.

---

## 2. 시스템 아키텍처 — 모듈 구조

전체 구조는 모듈러 모놀리식이다. 배포 단위는 하나(GCP Cloud Run 서비스 1개)지만, 코드베이스 내부는 아래 7개 모듈로 경계를 나눈다.

| 모듈 | 책임 | PRD 근거 |
|---|---|---|
| Auth | 인증, 세션/토큰 관리, (확장 단계) 프로젝트 멤버십 권한 검사 | 3.6 |
| ProjectCore | 프로젝트 CRUD, 프로젝트 상태(current_stage) 관리 | 3.5 |
| DocStore | 기획·설계 문서 저장/조회, 커밋 참조 연결 | 3.1 |
| EnvCatalog | 기술스택·환경 템플릿 관리, 도커 설정 생성 요청, Policy Gate 연동 | 3.2 |
| AgentRegistry | 에이전트 md 관리, 실행 이력·토큰/비용 집계 | 3.3 |
| Ingest | GitHub 웹훅 수신, 로그 적재, 헬스 스코어 계산 트리거 | 3.4, 3.5 |
| Realtime | Ingest가 적재한 데이터를 SSE로 클라이언트에 스트리밍 | 3.4 |

**모듈 간 결합 원칙**: Ingest는 다른 모듈에 직접 함수를 호출하지 않고 내부 이벤트만 발행한다(8장 참조). 이는 Ingest가 향후 부하 증가 시 가장 먼저 분리될 후보이기 때문이며, PRD 4장의 확장성 요구사항에 따른 설계 결정이다.

---

## 3. 기술 스택 상세

| 영역 | 채택 | 선정 근거 (요약) |
|---|---|---|
| 백엔드 프레임워크 | NestJS | 모듈 구조를 프레임워크 레벨에서 강제해 "모듈러 모놀리식" 원칙과 부합. AgentRegistry는 실제 멀티에이전트 오케스트레이션(레벨 3) 요구사항 발생 시 Python 분리 검토 |
| 데이터베이스 | PostgreSQL (단일) | 정형 데이터와 로그를 한 곳에서 관리, 운영 단순. LOG_ENTRIES 조회 성능 저하 시 TimescaleDB 확장 적용 |
| 실시간 통신 | SSE | 대시보드는 서버→클라이언트 단방향 스트리밍만 필요, WebSocket 대비 인프라 부담 낮음 |
| 프로젝트 연동 | GitHub API + Webhook | "릴리즈 관리처럼" 다루고 싶다는 요구와 부합, 멀티유저 확장 시 OAuth로 사용자별 레포 접근 가능 |
| 정책 검사(Policy Gate) | Trivy + Conftest(OPA) | 둘 다 Go 바이너리로 NestJS 파이프라인에 Python 의존성을 새로 끌어들이지 않음. Trivy가 표준 취약점·설정 오류를, Conftest가 서비스 특화 규칙(포트 화이트리스트 등)을 담당 |
| 배포 | GCP Cloud Run + Cloud SQL | 요청 기반으로 0까지 스케일되어 1인 개발 단계 비용 최소화. ECS Fargate는 상시 과금이라 비용 부담으로 최종 제외 |

### 3.1 인증 방식 — 채택: GitHub OAuth

PRD 3.6은 "단일 사용자 인증"만 요구하고 구체적 방식은 정하지 않았기에 아래 비교를 근거로 GitHub OAuth를 채택했다.

| 후보 | 장점 | 단점 |
|---|---|---|
| **GitHub OAuth** | 이미 GitHub 연동(레포 접근)이 필수이므로, 로그인과 레포 접근 권한을 한 번에 획득 가능. 별도 비밀번호 관리 불필요 | GitHub 계정이 없는 사용자는 원천적으로 가입 불가 (단, 본 플랫폼 성격상 GitHub 미사용자는 애초에 타깃 사용자가 아님) |
| **이메일/비밀번호 + JWT** | 특정 서비스 종속 없음, 구현 자유도 높음 | 비밀번호 저장·재설정·보안 정책을 직접 구현·관리해야 함, GitHub 연동은 별도로 한 번 더 필요 |
| **관리형 인증 서비스** (Auth0, Clerk 등) | 구현 최소화, 보안 모범사례 자동 적용 | 별도 서비스 종속과 비용 발생, 1인 개발 단계에 굳이 필요한 수준은 아님 |

**채택**: **GitHub OAuth**. 어차피 프로젝트 연동에 GitHub 인증이 필요하므로, 로그인 수단을 따로 만들지 않고 하나로 합쳤다. 확장 단계(멀티유저)에서도 협업자 초대 시 GitHub 계정 기준으로 자연스럽게 이어진다.

---

## 4. 데이터 모델 (재설계)

PRD의 모든 기능 요구사항을 근거로 19개 엔티티로 재구성했다. 상세 스키마·enum·제약 규칙은 Part 3(데이터 모델) 참조. 이전 버전(PRD 작성 전 초안) 대비 변경점은 다음과 같다.

- **PROJECTS.owner_id 제거, PROJECT_MEMBERS 신설**: 단일 소유자 구조로는 PRD 3.6(멀티유저 확장 전제)을 충족할 수 없어, 프로젝트-사용자 다대다 관계로 변경. role 컬럼으로 owner/member 구분
- **PROJECT_STAGE_HISTORY 신설**: PRD 3.4의 "진행 단계 전환 이력 타임라인" 요구사항을 뒷받침. PROJECTS.current_stage는 현재 상태만, 이 테이블이 이력을 담당
- **HEALTH_SNAPSHOTS 구조 변경**: 단일 score 컬럼에서 DORA 4개 지표별 등급 점수(deploy_freq_score, lead_time_score, change_fail_score, mttr_score) + composite_score로 확장. PRD가 확정한 "DORA 등급 매핑" 산출 방식을 그대로 스키마에 반영
- **POLICY_CHECK_RESULTS에 tool 컬럼 추가**: Trivy/Conftest 중 어느 도구의 검사 결과인지 구분
- **SESSIONS 신설**: `/auth/logout`의 "세션 토큰 무효화" 계약을 지키기 위해 서버 세션 방식 채택 (stateless JWT는 즉시 무효화 불가, Redis 블랙리스트는 현 규모에 과함)
- **PROJECT_BUDGETS 신설**: PRD 3.3의 "프로젝트별 토큰/비용 예산"을 담을 엔티티가 없었음. 예산은 에이전트가 아닌 프로젝트 단위
- **ENV_TEMPLATES.owner_id 추가**: 템플릿 삭제/수정 권한 검사 근거. 템플릿은 프로젝트가 아닌 사용자에 귀속
- **PROJECTS.deleted_at 추가 (soft delete)**: hard delete + cascade는 감사 로그까지 삭제해 감사 추적 목적과 충돌. 모든 조회에 `deleted_at IS NULL` 적용, GCS 파일만 30일 후 별도 정리
- **AUDIT_LOGS.project_id는 nullable**: 로그인/로그아웃, 템플릿 CRUD 등 프로젝트 스코프가 아닌 행위도 감사 대상
- **WEBHOOK_DELIVERIES 신설**: `X-GitHub-Delivery` 기준 멱등성 보장을 위한 저장소. delivery_id 유니크 제약이 중복 처리를 막는 실제 장치
- **DEPLOYMENT_EVENTS 신설**: 헬스 스코어 산출식은 정했으나 입력 데이터를 담을 곳이 없었음. GitHub `deployment_status`/`workflow_run` 웹훅으로 적재하고 DORA 4지표를 전부 여기서 도출
- **PROJECT_API_KEYS 신설**: 외부 에이전트가 로그·실행이력을 밀어넣는 쓰기 경로에 사용자 세션 대신 프로젝트 스코프 키를 사용

각 엔티티의 상세 필드와 관계는 위 다이어그램(ERD) 참조. 관계 요약:

- USERS ↔ PROJECTS는 PROJECT_MEMBERS를 통한 다대다
- PROJECTS 1 : N DOCUMENTS, AGENTS, LOG_ENTRIES, HEALTH_SNAPSHOTS, PROJECT_STAGE_HISTORY, AUDIT_LOGS
- PROJECTS 1 : 1(선택) GIT_INTEGRATIONS
- ENV_TEMPLATES 1 : N PROJECT_ENV_CONFIGS 1 : N POLICY_CHECK_RESULTS
- AGENTS 1 : N AGENT_RUNS, LOG_ENTRIES

### 4.1 문서 파일 저장소 — 채택: GCS

DOCUMENTS 엔티티는 지금까지 메타데이터(제목/타입/커밋 참조)만 다뤘는데, 실제 문서 원본(마크다운 텍스트, 또는 이미지·docx 같은 바이너리 파일)을 어디에 저장할지가 빠져 있었다.

| 후보 | 장점 | 단점 |
|---|---|---|
| **PostgreSQL TEXT 컬럼에 직접 저장** | 별도 인프라 없음, 조회 단순 | 바이너리 파일(이미지, docx, pdf) 저장에 부적합, DB 용량이 문서 크기에 비례해 커짐 |
| **GCS 버킷 + DB엔 메타데이터·URL만** | 파일 타입 제약 없음(마크다운/이미지/docx 전부 지원), DB는 가볍게 유지, Cloud Run과 같은 GCP 생태계라 연동 자연스러움 | 파일 조회 시 별도 요청 한 번 더 필요(다만 서명된 URL로 캐싱 가능해 체감 차이 적음) |

**채택**: **GCS**. DocStore가 다루는 문서가 마크다운 텍스트에 한정되지 않고(PRD 3.1에 다이어그램·시각화 자료도 언급됨) 향후 이미지·PDF까지 다룰 가능성이 높으므로 처음부터 파일 타입 제약이 없는 방식으로 갔다. DOCUMENTS 엔티티에 `file_url`(GCS 객체 경로) 컬럼을 추가한다.

---

## 5. 배포 아키텍처

### 5.1 런타임 구성
- **컴퓨트**: GCP Cloud Run (NestJS 컨테이너, 요청 기반 오토스케일 — 트래픽 없을 때 0으로 스케일되어 비용 최소화)
- **데이터베이스**: Cloud SQL for PostgreSQL (Cloud Run과 VPC 커넥터로 연결, 퍼블릭 IP 비활성화)
- **시크릿 관리**: GCP Secret Manager (GitHub 웹훅 시크릿, Claude API 키 등)
- **파일 저장소**: GCS (4.1절 참조)
- **정적 자산/프론트엔드**: 프론트엔드 프레임워크는 API 설계 단계에서 별도 논의 (9장 미해결 사항)

**비용 관점에서 AWS ECS Fargate 대신 GCP를 최종 채택한 이유**: Fargate는 상시 실행 태스크 기준으로 과금되고 ALB도 별도 구성이 필요해 1인 개발 단계에서 고정비가 발생한다. Cloud Run은 컨테이너 하나로 공개 엔드포인트·오토스케일(0으로 스케일 포함)이 자동 제공되어 트래픽이 없는 초기 단계의 비용 부담이 훨씬 적다.

### 5.2 CI/CD — 채택: GitHub Actions

| 후보 | 장점 | 단점 |
|---|---|---|
| **GitHub Actions → gcloud run deploy** | 이미 GitHub 중심 워크플로우이므로 별도 서비스 추가 없이 바로 연결, 설정 단순 | GCP 네이티브 도구 대비 세밀한 빌드 캐싱 등은 직접 구성 필요 |
| **GCP Cloud Build 트리거** | GCP 생태계 내에서 완결, Cloud Run과 통합 매끄러움 | GitHub 대신 GCP 콘솔에서 별도로 트리거 관리해야 해서 워크플로우가 두 곳으로 분산 |

**채택**: **GitHub Actions**. 코드/이슈/PR 관리를 이미 GitHub에서 하므로 배포 파이프라인도 같은 곳에 두는 게 일관성 있고, 1인 개발 단계에서 관리 지점을 늘리지 않는다.

---

## 6. 보안 설계

### 6.1 Policy Gate 상세 구조
```
LLM 도커 설정 생성
  → Trivy config scan (Dockerfile/Compose 표준 취약점·설정 오류 검사)
  → Conftest/OPA 커스텀 규칙 검사 (포트 화이트리스트, 리소스 제한 강제, 이미지 소스 화이트리스트)
  → 둘 다 통과해야 사람 승인 단계로 노출
  → 사람 승인 (설정 diff + 자연어 위험도 설명)
  → 표준 docker build/run 실행
```
검사 결과는 POLICY_CHECK_RESULTS에 tool별로 각각 기록되어, 나중에 "어느 도구가 무엇을 잡아냈는지" 추적 가능하다.

### 6.2 시크릿 관리
- GitHub 웹훅 시크릿, Cloud SQL 접속 정보, Claude API 키는 모두 GCP Secret Manager에 저장하고 런타임에 주입한다. 데이터베이스나 코드에 평문으로 저장하지 않는다.

### 6.3 웹훅 엔드포인트 보호
- Ingest 모듈의 GitHub 웹훅 수신 엔드포인트는 공개 URL이므로, 모든 요청에 대해 GitHub가 제공하는 HMAC 서명(`X-Hub-Signature-256`)을 GIT_INTEGRATIONS에 저장된 시크릿으로 검증한다. 서명이 일치하지 않는 요청은 즉시 거부한다.

### 6.4 헬스 스코어 산출 (DORA)

DEPLOYMENT_EVENTS를 집계해 4지표를 도출하고, 각각을 등급 구간에 매핑해 1~4점(Low~Elite)을 부여한 뒤 평균해 composite_score를 만든다. 1인 사이드 프로젝트 특성을 반영해 원본 DORA 구간보다 완화한 기준을 적용한다.

| 지표 | 도출 방법 | Elite(4) | High(3) | Medium(2) | Low(1) |
|---|---|---|---|---|---|
| 배포 빈도 | success 이벤트 수 | 주 1회 이상 | 월 1회 이상 | 분기 1회 이상 | 그 미만 |
| 변경 리드타임 | `committed_at`→`occurred_at` 중앙값 | 1일 이내 | 1주 이내 | 1개월 이내 | 그 초과 |
| 변경 실패율 | failure / 전체 | 15% 이하 | 30% 이하 | 45% 이하 | 그 초과 |
| MTTR | failure→다음 success 중앙값 | 1시간 이내 | 1일 이내 | 1주 이내 | 그 초과 |

데이터가 부족한 경우(이벤트 0건) 해당 지표는 점수 산정에서 제외하고, 남은 지표만으로 평균한다. 4개 모두 없으면 헬스 스코어를 계산하지 않는다.

### 6.5 감사 추적
- AUDIT_LOGS가 사용자 행위를 기록하며, 확장 단계(멀티유저)에서 "누가 어떤 프로젝트를 변경했는지" 추적의 기반이 된다. MVP 단계부터 기록 체계를 구축해 스키마 변경 없이 확장 가능하게 한다 (PRD 9장 근거).

---

## 7. 비기능 요구사항 구현 방안

| PRD 비기능 요구사항 | 구현 방안 |
|---|---|
| 확장성 | 모듈 경계를 명확히 유지 (8장 통신 방식 참조). Ingest가 최초 분리 후보이므로 이벤트 기반 결합만 허용 |
| 실시간성 | Ingest가 로그/헬스 스코어 변경 시 내부 이벤트 발행 → Realtime 모듈이 구독해 SSE로 클라이언트에 즉시 전달 |
| 멀티유저 대비 | PROJECT_MEMBERS, AUDIT_LOGS를 MVP부터 구축 (실제 초대 UI는 확장 단계) |
| 안전성 | Policy Gate가 사람 승인과 독립적으로 위험 설정을 원천 차단 (6.1) |
| 운영 지향 | Cloud Run 오토스케일 + Cloud SQL 관리형 백업으로 플랫폼 자체의 가용성 확보 |

---

## 8. 모듈 간 통신 방식 — 채택: 인프로세스 이벤트

| 후보 | 장점 | 단점 |
|---|---|---|
| **직접 서비스 호출 (NestJS DI)** | 구현 가장 단순, 디버깅 쉬움 | 모듈 간 강결합 발생 — 특히 Ingest가 다른 모듈을 직접 호출하면 나중에 분리하기 어려워짐 |
| **인프로세스 이벤트 (NestJS EventEmitter2)** | 모듈 간 느슨한 결합 유지, 별도 인프라 불필요, 지금 규모에 적합 | 이벤트 발행/구독 관계가 코드만 봐서는 추적이 다소 어려움 (문서화 필요) |
| **메시지 큐 (Redis/BullMQ)** | 진짜 비동기·분산 처리 가능, Ingest를 나중에 별도 서비스로 뜯어낼 때 전환 비용 최소화 | 지금 트래픽 규모에 별도 인프라(Redis)를 운영하는 건 명백한 오버엔지니어링 |

**채택**: **인프로세스 이벤트(EventEmitter2)**로 시작한다. Ingest 모듈이 이벤트만 발행하고 다른 모듈을 직접 호출하지 않는 규칙을 지키면, 나중에 Ingest가 실제로 분리될 시점에 이벤트 발행 부분만 Redis/큐 기반(또는 GCP Pub/Sub)으로 교체하면 되고 구독 측 코드는 거의 손대지 않아도 된다. 지금 메시지 큐부터 도입하는 건 PRD의 "오버엔지니어링 방지" 원칙에 어긋난다.

---

## 9. 미해결 사항

1. 프론트엔드 기술 스택(SPA 프레임워크 선택)은 API 설계 단계에서 별도 논의 필요
2. Cloud SQL 인스턴스 스펙(vCPU/메모리)은 실제 부하 테스트 후 결정
3. GitHub OAuth 앱 등록 시 필요한 스코프(repo 읽기 범위 등) 상세는 구현 단계에서 확정

---

# Part 3. 데이터 모델 (ERD)

## 엔티티 목록 (19개)

| 엔티티 | 역할 | 관련 모듈 |
|---|---|---|
| USERS | 사용자 계정 (GitHub OAuth 기준) | Auth |
| SESSIONS | 세션 토큰 (로그아웃 시 즉시 무효화용) | Auth |
| PROJECT_API_KEYS | 외부 에이전트가 로그·실행이력을 밀어넣을 때 쓰는 프로젝트 스코프 키 | Auth, Ingest |
| PROJECT_MEMBERS | 사용자-프로젝트 다대다 + 역할(owner/member) | Auth, ProjectCore |
| PROJECTS | 프로젝트 본체, 현재 진행 단계 | ProjectCore |
| GIT_INTEGRATIONS | GitHub 레포 연동 정보, 웹훅 시크릿 참조 | ProjectCore, Ingest |
| DOCUMENTS | 기획·설계 문서 메타데이터 + GCS 객체 경로 | DocStore |
| ENV_TEMPLATES | 재사용 가능한 기술스택·도커 프리셋 | EnvCatalog |
| PROJECT_ENV_CONFIGS | 특정 프로젝트에 적용된 실제 환경 구성 | EnvCatalog |
| POLICY_CHECK_RESULTS | Trivy/Conftest 정책 검사 결과 (도구별 기록) | EnvCatalog |
| AGENTS | 에이전트 설정(md) | AgentRegistry |
| AGENT_RUNS | 에이전트 실행 이력, 토큰·비용 | AgentRegistry |
| PROJECT_BUDGETS | 프로젝트별 토큰/비용 예산 및 알림 임계치 | AgentRegistry |
| LOG_ENTRIES | 실행/에러 로그 | Ingest |
| WEBHOOK_DELIVERIES | 처리 완료한 GitHub delivery ID (멱등성 보장) | Ingest |
| DEPLOYMENT_EVENTS | 배포·워크플로 성공/실패 이력 (DORA 4지표 산출 입력) | Ingest |
| PROJECT_STAGE_HISTORY | 진행 단계 전환 이력 (타임라인용) | Ingest |
| HEALTH_SNAPSHOTS | DORA 4지표 등급 점수 + 종합 점수 시계열 | Ingest |
| AUDIT_LOGS | 사용자 행위 감사 기록 | Audit |

---

## ERD (Mermaid)

```mermaid
erDiagram
  USERS ||--o{ SESSIONS : has
  PROJECTS ||--o{ PROJECT_API_KEYS : has
  PROJECTS ||--o{ WEBHOOK_DELIVERIES : receives
  PROJECTS ||--o{ DEPLOYMENT_EVENTS : records
  USERS ||--o{ ENV_TEMPLATES : owns
  PROJECTS ||--o| PROJECT_BUDGETS : has
  USERS ||--o{ PROJECT_MEMBERS : "joins as"
  PROJECTS ||--o{ PROJECT_MEMBERS : has
  PROJECTS ||--o{ DOCUMENTS : contains
  PROJECTS ||--o| GIT_INTEGRATIONS : "connected via"
  PROJECTS ||--o{ PROJECT_ENV_CONFIGS : has
  ENV_TEMPLATES ||--o{ PROJECT_ENV_CONFIGS : "based on"
  PROJECT_ENV_CONFIGS ||--o{ POLICY_CHECK_RESULTS : "checked by"
  PROJECTS ||--o{ AGENTS : uses
  AGENTS ||--o{ AGENT_RUNS : has
  AGENTS ||--o{ LOG_ENTRIES : generates
  PROJECTS ||--o{ LOG_ENTRIES : generates
  PROJECTS ||--o{ HEALTH_SNAPSHOTS : tracks
  PROJECTS ||--o{ PROJECT_STAGE_HISTORY : tracks
  USERS ||--o{ AUDIT_LOGS : performs
  PROJECTS ||--o{ AUDIT_LOGS : "target of"

  USERS {
    uuid id PK
    string email
    string github_login
    timestamptz created_at
  }
  SESSIONS {
    uuid id PK
    uuid user_id FK
    string token_hash
    timestamptz expires_at
    timestamptz revoked_at
  }
  PROJECT_BUDGETS {
    uuid id PK
    uuid project_id FK UK
    int token_limit
    numeric cost_limit
    numeric alert_threshold_pct
  }
  PROJECT_API_KEYS {
    uuid id PK
    uuid project_id FK
    string key_hash
    string label
    timestamptz created_at
    timestamptz revoked_at
  }
  WEBHOOK_DELIVERIES {
    uuid id PK
    uuid project_id FK
    string delivery_id UK
    string event_type
    timestamptz received_at
  }
  DEPLOYMENT_EVENTS {
    uuid id PK
    uuid project_id FK
    string kind
    string status
    string commit_sha
    timestamptz committed_at
    timestamptz occurred_at
  }
  PROJECT_MEMBERS {
    uuid id PK
    uuid project_id FK UK
    uuid user_id FK UK
    string role
    timestamptz joined_at
  }
  PROJECTS {
    uuid id PK
    string name
    string current_stage
    timestamptz created_at
    timestamptz updated_at
    timestamptz deleted_at
  }
  GIT_INTEGRATIONS {
    uuid id PK
    uuid project_id FK UK
    string repo_url
    string webhook_secret_ref
    timestamptz connected_at
  }
  DOCUMENTS {
    uuid id PK
    uuid project_id FK
    string title
    string type
    string file_url
    string upload_status
    string commit_ref
    timestamptz created_at
  }
  ENV_TEMPLATES {
    uuid id PK
    uuid owner_id FK
    string name
    json stack_preset
    json docker_preset
    timestamptz created_at
  }
  PROJECT_ENV_CONFIGS {
    uuid id PK
    uuid project_id FK
    uuid template_id FK
    json stack_config
    json docker_config
    string build_status
    timestamptz created_at
  }
  POLICY_CHECK_RESULTS {
    uuid id PK
    uuid env_config_id FK
    string tool
    string verdict
    text risk_notes
    timestamptz checked_at
  }
  AGENTS {
    uuid id PK
    uuid project_id FK
    string name
    text config_md
    timestamptz updated_at
  }
  AGENT_RUNS {
    uuid id PK
    uuid agent_id FK
    string status
    int tokens_used
    numeric cost
    timestamptz started_at
    timestamptz ended_at
  }
  LOG_ENTRIES {
    uuid id PK
    uuid project_id FK
    uuid agent_id FK
    string level
    text message
    timestamptz created_at
  }
  PROJECT_STAGE_HISTORY {
    uuid id PK
    uuid project_id FK
    string stage
    timestamptz entered_at
  }
  HEALTH_SNAPSHOTS {
    uuid id PK
    uuid project_id FK
    int deploy_freq_score
    int lead_time_score
    int change_fail_score
    int mttr_score
    numeric composite_score
    timestamptz measured_at
  }
  AUDIT_LOGS {
    uuid id PK
    uuid user_id FK
    uuid project_id FK "nullable"
    string action
    timestamptz created_at
  }
```

---

## 주요 설계 결정

**PROJECTS에 owner_id를 두지 않음**
소유권은 PROJECT_MEMBERS.role='owner'로 표현한다. 단일 소유자 컬럼 방식은 멀티유저 확장 시 스키마 변경이 필요하므로, PRD 3.6(멀티유저 확장 전제)에 따라 처음부터 다대다 구조로 설계했다.

**PROJECT_STAGE_HISTORY를 PROJECTS.current_stage와 분리**
current_stage는 현재 상태만 담고, 단계 전환 이력은 별도 테이블이 담당한다. PRD 3.4의 "진행 단계 타임라인 시각화" 요구사항은 이력 없이는 구현 불가능하다.

**HEALTH_SNAPSHOTS에 DORA 4지표를 개별 컬럼으로 저장**
단일 score 컬럼이 아니라 지표별 등급 점수(1~4)를 각각 저장하고 composite_score를 함께 둔다. 이렇게 해야 "종합 점수는 낮은데 어느 지표 때문인지" 대시보드에서 분해해서 보여줄 수 있다.

**POLICY_CHECK_RESULTS에 tool 컬럼**
Trivy와 Conftest가 각각 별도 레코드를 남긴다. 어느 도구가 무엇을 잡아냈는지 추적 가능해야 룰 커버리지를 개선할 수 있다 (PRD 10장 리스크 대응).

**SESSIONS 테이블로 서버 세션 관리**
API 설계가 `/auth/logout`에서 "세션 토큰 무효화"를 계약으로 명시했으므로 stateless JWT로는 그 계약을 지킬 수 없다(토큰 만료 전까지 유효). Redis 블랙리스트는 현 규모에 오버엔지니어링이라, 요청당 DB 조회 1회를 감수하고 SESSIONS 테이블을 둔다. 다중 기기 세션 관리·강제 로그아웃도 함께 얻는다.

**예산은 프로젝트 단위 (PROJECT_BUDGETS)**
PRD 3.3이 "프로젝트별 토큰/비용 예산"으로 명시했다. 에이전트 단위 예산은 요구사항에 없으므로 API를 PRD에 맞춰 정정했다.

**ENV_TEMPLATES.owner_id**
소유자 없이는 템플릿 삭제/수정 권한을 검사할 근거가 없다. 템플릿은 프로젝트에 종속되지 않고 사용자에게 귀속된다(여러 프로젝트에서 재사용되므로).

**AUDIT_LOGS.project_id는 nullable**
로그인/로그아웃, 템플릿 CRUD 등 프로젝트 스코프가 아닌 행위도 감사 대상이므로 project_id가 없는 레코드가 정상적으로 발생한다.

**프로젝트 삭제는 soft delete (PROJECTS.deleted_at)**
감사 로그를 MVP부터 두기로 한 결정과 hard delete는 정면 충돌한다(프로젝트를 지우면 감사 추적 자체가 사라짐). 모든 조회에 `deleted_at IS NULL` 필터를 적용하고, GCS 문서 파일만 삭제 후 30일 경과 시 별도 정리한다.

**WEBHOOK_DELIVERIES로 멱등성 보장**
GitHub는 동일 이벤트를 재전송할 수 있다. `delivery_id`에 유니크 제약을 걸고 삽입 실패 시 해당 요청을 무시하는 방식으로, 중복 로그 적재와 헬스 스코어 이중 계산을 막는다.

**DEPLOYMENT_EVENTS로 DORA 지표 입력 확보**
헬스 스코어 산출식은 정했지만 그 입력 데이터를 담을 곳이 없었다. GitHub의 `deployment_status`·`workflow_run` 웹훅 이벤트를 이 테이블에 적재하고, 4지표를 전부 여기서 도출한다 — 배포빈도(성공 이벤트 수), 리드타임(`committed_at`→`occurred_at`), 변경실패율(failure 비율), MTTR(failure→다음 success 간격). 별도 리포팅 코드를 각 프로젝트에 심지 않아도 되고, PRD 9장의 GitHub 전제를 그대로 활용한다.

**PROJECT_API_KEYS로 에이전트 쓰기 경로 분리**
로그·실행 이력을 밀어넣는 주체는 사용자 브라우저가 아니라 외부에서 도는 에이전트다. 사용자 세션 토큰을 에이전트에 심는 건 위험하므로, 프로젝트 스코프로 한정된 별도 API 키를 발급한다. 키는 해시로만 저장한다.

**ENV_TEMPLATES와 PROJECT_ENV_CONFIGS 분리**
템플릿은 재사용 프리셋이고, 실제 프로젝트에 적용된 구성은 별개다. 한 템플릿에서 파생된 여러 프로젝트가 각자 다르게 커스터마이징한 이력이 남아야 한다.

---

## Enum 값 정의

| 컬럼 | 허용 값 |
|---|---|
| `PROJECTS.current_stage` | `planning`, `design`, `development`, `testing`, `deployment`, `operation` |
| `PROJECT_MEMBERS.role` | `owner`, `member` |
| `DOCUMENTS.type` | `prd`, `srs`, `tech_spec`, `other` |
| `DOCUMENTS.upload_status` | `pending`, `completed` |
| `PROJECT_ENV_CONFIGS.build_status` | `generated`, `policy_passed`, `policy_blocked`, `approved`, `rejected`, `running`, `succeeded`, `failed` |
| `POLICY_CHECK_RESULTS.tool` | `trivy`, `conftest` |
| `POLICY_CHECK_RESULTS.verdict` | `pass`, `fail` |
| `AGENT_RUNS.status` | `running`, `succeeded`, `failed`, `cancelled` |
| `LOG_ENTRIES.level` | `error`, `warn`, `info` |
| `DEPLOYMENT_EVENTS.kind` | `deployment`, `workflow_run` |
| `DEPLOYMENT_EVENTS.status` | `success`, `failure` |
| `AUDIT_LOGS.action` | `login`, `logout`, `project.create`, `project.update`, `project.delete`, `document.create`, `document.delete`, `agent.create`, `agent.update`, `agent.delete`, `env_config.create`, `env_config.approve`, `env_config.reject`, `template.create`, `template.delete`, `budget.update`, `api_key.create`, `api_key.revoke` |

## 제약 및 타입 규칙

- **금액 컬럼은 `numeric(12,4)`**: `AGENT_RUNS.cost`, `PROJECT_BUDGETS.cost_limit`. 부동소수점 누적 오차가 예산 임계치 판정을 어긋나게 하므로 float 사용 금지
- **모든 시각 컬럼은 `timestamptz`**: 배포 환경과 사용자 타임존이 다를 수 있고, DORA 리드타임·MTTR 계산이 시각차에 의존하므로 타임존 정보 필수
- **유니크 제약**: `PROJECT_MEMBERS(project_id, user_id)` 복합 유니크, `GIT_INTEGRATIONS.project_id` 유니크(1:1), `PROJECT_BUDGETS.project_id` 유니크(1:1), `WEBHOOK_DELIVERIES.delivery_id` 유니크(멱등성 보장의 핵심)
- **FK 삭제 정책**: `PROJECT_ENV_CONFIGS.template_id`는 `ON DELETE SET NULL`. RESTRICT면 한 번 사용된 템플릿을 영구히 삭제할 수 없게 되고, 환경 구성은 "그때 무엇이 실행됐는가"의 이력이므로 원본 템플릿이 사라져도 보존되어야 한다

## 확장 시 주의점

- **LOG_ENTRIES**가 가장 빠르게 증가할 테이블이다. 조회 성능 저하 시 이 테이블을 TimescaleDB 하이퍼테이블로 전환하는 것이 1순위 (기술 사양서 3장).
- **AUDIT_LOGS**는 MVP 단계에서 기록만 하고 조회 UI는 확장 단계에 붙인다. 기록 체계를 처음부터 두는 이유는 멀티유저 전환 시 소급 기록이 불가능하기 때문이다.

---

# Part 4. API 설계

## 1. 공통 규약

- **Base URL**: `/api/v1`
- **인증**: 세 가지 방식이 공존한다.
  - 사용자 API: GitHub OAuth 세션 토큰을 `Authorization: Bearer <token>`으로 전달 (SESSIONS 조회로 검증, `revoked_at`이 있으면 401)
  - 에이전트 쓰기 API(`POST /projects/:id/logs`, `POST /agents/:id/runs`): 프로젝트 스코프 API 키를 `X-API-Key` 헤더로 전달. 외부에서 도는 에이전트에 사용자 세션을 심지 않기 위함
  - 웹훅(`POST /webhooks/github`): GitHub HMAC 서명(`X-Hub-Signature-256`) 검증
- **페이지네이션**: 목록 조회 엔드포인트는 `?cursor=&limit=`(기본 20, 최대 100) 커서 기반 페이지네이션 사용. 응답은 `{ items: [...], next_cursor: string | null }` 형태
- **에러 포맷**: `{ error: { code: string, message: string } }`, HTTP 상태 코드와 함께 반환
- **리소스 소유권 검사**: 모든 프로젝트 하위 리소스 요청은 요청자가 해당 프로젝트의 PROJECT_MEMBERS인지 검사 (MVP 단계는 본인 소유 프로젝트만 존재하므로 사실상 owner 검사와 동일하지만, 확장 단계 전환 시 로직 변경 없이 그대로 동작)

---

## 2. Auth

| Method | Path | 설명 | 인증 |
|---|---|---|---|
| GET | `/auth/github/login` | GitHub OAuth 인증 페이지로 리다이렉트 | 불필요 |
| GET | `/auth/github/callback` | OAuth 콜백 — 코드 교환 후 세션 토큰 발급, USERS 레코드 생성/조회 | 불필요 (OAuth code로 검증) |
| POST | `/auth/logout` | 세션 토큰 무효화 (SESSIONS.revoked_at 기록, 이후 해당 토큰 요청은 401) | 필요 |
| GET | `/auth/me` | 현재 로그인한 사용자 정보 조회 | 필요 |

---

## 3. ProjectCore

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects` | 내가 속한(PROJECT_MEMBERS) 프로젝트 목록 조회 |
| POST | `/projects` | 프로젝트 생성 — 생성 시 요청자를 PROJECT_MEMBERS(role=owner)로 등록 |
| GET | `/projects/:id` | 프로젝트 상세 (current_stage 포함) |
| PATCH | `/projects/:id` | 프로젝트 이름/상태 수정 |
| DELETE | `/projects/:id` | 프로젝트 soft delete (`deleted_at` 기록). 감사 로그 보존을 위해 hard delete 하지 않으며, 모든 조회는 `deleted_at IS NULL` 필터를 적용한다. GCS 문서 파일은 30일 경과 후 별도 정리 |
| POST | `/projects/:id/git-integration` | GitHub 레포 연동 등록 (repo_url 저장, 웹훅 자동 등록, 시크릿은 Secret Manager에 저장) |
| DELETE | `/projects/:id/git-integration` | GitHub 연동 해제 |
| GET | `/projects/:id/api-keys` | 발급된 API 키 목록 (해시만 저장하므로 원문은 재조회 불가, label/생성일만 반환) |
| POST | `/projects/:id/api-keys` | API 키 발급 — **응답에서만 원문 1회 노출**, 이후 조회 불가 |
| DELETE | `/api-keys/:id` | API 키 폐기 (`revoked_at` 기록) |

**요청 예시** — `POST /projects`
```json
{ "name": "nol-clone-dashboard" }
```

---

## 4. DocStore

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects/:id/documents` | 프로젝트의 문서 목록 (타입 필터 `?type=prd\|srs\|tech_spec\|other`) |
| POST | `/projects/:id/documents` | 문서 메타데이터 생성 + GCS 업로드용 signed URL 발급 |
| POST | `/documents/:id/complete` | 업로드 완료 확인 — `upload_status`를 `pending`→`completed`로 전이. 이 호출이 없으면 메타데이터만 남은 고아 레코드가 되며, `pending` 상태로 24시간 경과 시 정리 배치가 삭제한다 |
| GET | `/documents/:id` | 문서 상세 (GCS 조회용 signed URL 포함). `completed` 상태만 조회 결과에 포함 |
| PATCH | `/documents/:id` | 문서 메타데이터 수정 (제목/타입/커밋 참조) |
| DELETE | `/documents/:id` | 문서 삭제 (GCS 객체도 함께 삭제) |

**업로드 플로우**: `POST /projects/:id/documents`로 메타데이터 생성(`upload_status=pending`) → 응답으로 GCS signed upload URL 수신 → 클라이언트가 그 URL로 파일 직접 업로드(서버를 거치지 않음) → `POST /documents/:id/complete`로 완료 확인(`completed`). 완료 확인 단계가 없으면 업로드가 중간에 실패해도 메타데이터가 남아 조회 시 깨진 링크가 된다.

---

## 5. EnvCatalog

### 5.1 템플릿 관리

| Method | Path | 설명 |
|---|---|---|
| GET | `/env-templates` | 내가 소유한(`owner_id`) 템플릿 목록 |
| POST | `/env-templates` | 새 템플릿 저장 — `owner_id`는 요청자로 자동 설정 |
| GET | `/env-templates/:id` | 템플릿 상세 |
| DELETE | `/env-templates/:id` | 템플릿 삭제 — `owner_id`가 요청자와 일치할 때만 허용, 아니면 403 |

### 5.2 프로젝트 환경 구성 + Policy Gate 플로우

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects/:id/env-configs` | 프로젝트의 환경 구성 이력 조회 |
| POST | `/projects/:id/env-configs` | 새 환경 구성 생성 — UI 입력값 또는 자연어 입력을 받아 LLM에 전달, Dockerfile/compose 생성 (build_status=`generated`) |
| GET | `/env-configs/:id` | 환경 구성 상세 (생성된 stack_config, docker_config 포함) |
| GET | `/env-configs/:id/policy-checks` | 해당 구성에 대한 Trivy/Conftest 검사 결과 목록 |
| POST | `/env-configs/:id/approve` | 사람 승인 — `build_status=policy_passed`인 구성만 승인 가능, 그 외 상태는 409 |
| POST | `/env-configs/:id/reject` | 반려 |
| POST | `/env-configs/:id/execute` | 승인된(`approved`) 구성의 실행을 트리거 — 실제 실행 방식(어떤 인프라에서 docker build/run이 수행되는지)은 기술 사양서 9장의 미해결 사항(EnvCatalog 실행 인프라)에 의존하므로, 본 엔드포인트는 상태 전이 계약만 정의하고 내부 실행 어댑터는 해당 결정 이후 구현 |

**상태 전이**:
```
generated
  → (Policy Gate 자동 실행) → policy_passed | policy_blocked
  → (사람 승인, policy_passed에서만 가능) → approved | rejected
  → (실행) → running → succeeded | failed
```

**Policy Gate 판정 규칙 (AND)**: `policy_passed`는 **Trivy와 Conftest가 모두 `verdict=pass`일 때만** 부여한다. 하나라도 fail이면 `policy_blocked`. 승인 API는 개별 검사 결과를 다시 보지 않고 `build_status`만 검사하므로, 판정 로직이 두 곳에 흩어지지 않는다.

**요청 예시** — `POST /projects/:id/env-configs`
```json
{
  "template_id": "uuid | null",
  "input_mode": "ui | natural_language",
  "stack_input": { "language": "node", "framework": "nestjs", "db": "postgresql" }
}
```

---

## 6. AgentRegistry

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects/:id/agents` | 프로젝트의 에이전트 목록 |
| POST | `/projects/:id/agents` | 에이전트 생성 (name, config_md) |
| GET | `/agents/:id` | 에이전트 상세 (config_md 포함) |
| PATCH | `/agents/:id` | config_md 수정 |
| DELETE | `/agents/:id` | 에이전트 삭제 |
| POST | `/agents/:id/runs` | **실행 시작 기록** (에이전트가 호출, `X-API-Key` 인증) |
| PATCH | `/agent-runs/:id` | 실행 종료 기록 (status, tokens_used, cost, ended_at) — 갱신 시 프로젝트 예산 대비 사용률을 재계산하고 임계치 초과 시 알림 |
| GET | `/agents/:id/runs` | 실행 이력(AGENT_RUNS) 조회 — 토큰 사용량/비용/상태 |


**예산은 프로젝트 단위** (PRD 3.3 근거 — 에이전트 단위가 아님):

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects/:id/budget` | 프로젝트 예산 설정 및 현재 사용률 조회 (해당 프로젝트 전체 AGENT_RUNS 집계 대비) |
| PUT | `/projects/:id/budget` | 토큰/비용 예산 및 알림 임계치 설정 |

---

## 7. Ingest / Realtime

### 7.1 웹훅 수신 (Ingest 내부용, 프론트엔드가 호출하지 않음)

| Method | Path | 설명 | 인증 |
|---|---|---|---|
| POST | `/webhooks/github` | GitHub 커밋/PR 이벤트 수신 → 내부 이벤트 발행(EventEmitter2) → LOG_ENTRIES 적재, 필요 시 HEALTH_SNAPSHOTS 재계산 트리거 | HMAC 서명 검증 (6.3절 기술 사양서 참조) |

**멱등성 처리**: GitHub는 동일 웹훅 이벤트를 재전송할 수 있으므로, 요청 헤더의 `X-GitHub-Delivery`(고유 배달 ID)를 기준으로 이미 처리한 이벤트는 무시한다.

### 7.2 조회 API

| Method | Path | 설명 |
|---|---|---|
| POST | `/projects/:id/logs` | **로그 적재** (에이전트가 호출, `X-API-Key` 인증). 적재 후 SSE `log` 이벤트 발행 |
| GET | `/projects/:id/logs` | 로그 이력 조회 (레벨 필터 `?level=error\|warn\|info`, 페이지네이션) |
| GET | `/projects/:id/deployment-events` | DORA 지표 산출 원본 이벤트 조회 |
| GET | `/projects/:id/health-snapshots` | 헬스 스코어 시계열 조회 (DORA 4개 지표 등급 점수 + composite_score) |
| GET | `/projects/:id/stage-history` | 진행 단계 전환 이력 |

### 7.3 실시간 스트림

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects/:id/stream` | SSE 엔드포인트 — 새 로그, 헬스 스코어 갱신, 단계 전환 이벤트를 실시간 push |

**SSE 이벤트 타입**: `event: log`, `event: health_update`, `event: stage_change` — 클라이언트는 필요한 이벤트 타입만 구독

---

## 8. Audit

| Method | Path | 설명 |
|---|---|---|
| GET | `/projects/:id/audit-logs` | 프로젝트 스코프 감사 이력 조회 |
| GET | `/audit-logs` | 내 전체 감사 이력 조회 (로그인/로그아웃, 템플릿 CRUD 등 `project_id`가 null인 기록 포함) |

**AUDIT_LOGS.project_id는 nullable**이다 — 프로젝트에 속하지 않는 행위(인증, 템플릿 관리)도 감사 대상이기 때문이다. MVP는 조회만 제공하고, 확장 단계에서 멀티유저 권한 관리 UI와 연결한다.
