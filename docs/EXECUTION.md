# 환경 구성 실행 (Phase 8)

설계서 Part 4 §5.2는 실행 트리거만 정의하고 "무엇이 실행하는가"를 기술 사양서 9장의
미해결 사항으로 남겼다. 그 자리를 **사용자 레포의 GitHub Actions**로 채운다.

## 왜 GitHub Actions인가

우리 컨테이너에서 도커 빌드를 할 수 없다. Cloud Run에는 도커 데몬이 없고, 요청 타임아웃은
60초이며, 파일시스템은 메모리다. 빌드는 분 단위다.

남은 후보는 Cloud Build와 Actions였다. Actions를 고른 이유는 **이미 깔려 있는 레일**이다 —
레포 연동, 사용자 토큰(만료 시 갱신 포함), 서명 검증된 웹훅 수신 경로가 전부 Phase 3~7에서
만들어졌다. Cloud Build는 결과 회수를 위해 Pub/Sub 토픽과 구독을 새로 세워야 하고, GCP
권한이 하나 더 늘어난다. 무료 한도도 Actions 쪽이 넉넉하다(공개 레포는 무제한).

## 흐름

```
[사용자] 실행 누름
   → POST /env-configs/:id/execute
   → build_status: approved → running   (전이 이력 남김)
   → GitHub: workflow_dispatch 로 muster-env-build.yml 실행
        ref = 레포의 기본 브랜치 (물어봐서 쓴다. main으로 넘겨짚지 않는다)
        inputs.env_config_id = 이 구성의 id
   ...
[GitHub] 빌드 끝남
   → workflow_run 웹훅 (서명 검증)
   → run-name "muster-env <구성 id>" 로 대조
   → build_status: running → succeeded | failed  (실행 주소를 사유에 남김)
```

**실행 id로 대조하지 않는 이유**: `workflow_dispatch`는 만들어진 실행의 id를 돌려주지
않는다(GitHub API의 알려진 공백). 그래서 실행 **이름**에 구성 id를 박아 보내고 웹훅에서
다시 읽는다. 접두사 `muster-env `가 사용자 레포의 다른 워크플로와 우리 실행을 가른다.

## 준비 (프로젝트마다 한 번)

### 1. 워크플로 파일을 레포에 넣는다

프로젝트 → **환경 구성** 탭 → **워크플로 설치**를 누른다. Muster가 연동한 레포에
`muster/env-build-workflow` 브랜치를 만들어 파일을 넣고 PR을 연다. 그 PR을 머지하면 끝이다.

**PR인 이유**: 기본 브랜치에 말없이 커밋하지 않는다. 연동이 허락한 것은 "이 레포와
일한다"이지 "이 레포를 고친다"가 아니다. 무엇이 들어가는지 본 사람이 머지하는 편이 맞다.
두 번 눌러도 안전하다 — 브랜치 이름이 고정이고, 이미 기본 브랜치에 있으면 아무것도 하지 않는다.

**머지해야 실행된다.** `workflow_dispatch`는 기본 브랜치의 정의를 보므로, PR이 열려만
있는 동안에는 실행이 여전히 404다.

손으로 넣고 싶으면 `files/templates/muster-env-build.yml`을 같은 경로로 복사해도 된다
(같은 파일이다 — `env-workflow-template.spec.ts`가 둘이 갈라지지 않는지 지킨다).

### 2. Muster가 생성한 Dockerfile을 커밋한다

템플릿은 레포 루트의 `Dockerfile`을 빌드한다. 다른 경로에 두려면 템플릿의 확인 단계와
`build-push-action`의 `context`를 함께 고친다.

### 3. 기존 연동은 다시 걸어야 한다

`workflow_run`은 Phase 8에서 구독 목록에 추가됐다. **이미 등록된 웹훅은 자동으로 갱신되지
않는다** — 그 전에 연동한 프로젝트는 연동 해제 후 다시 걸어야 실행 결과가 돌아온다.
새로 거는 연동은 그대로 받는다.

## 실패는 어디에 남는가

| 무엇이 실패했나 | 사용자가 보는 것 | 구성 상태 |
|---|---|---|
| 레포 연동 없음 | 400 "먼저 GitHub 레포를 연동해야 합니다" | approved 유지 |
| 워크플로 파일 없음 | 400 "`muster-env-build.yml` 워크플로가 없습니다" | **failed** (사유 기록) |
| Actions 권한 없음 | 403 | **failed** |
| 빌드 실패 | 구성이 failed, 사유에 실행 주소 | failed |
| 빌드 취소·타임아웃 | 구성이 failed, 사유에 conclusion | failed |

시작조차 못 하면 `running`에 두지 않고 `failed`로 되돌린다. 아무것도 돌고 있지 않은데
화면에는 도는 것으로 보이는 상태가 가장 나쁘다.

웹훅이 재전송돼도 이미 끝난 구성은 되살아나지 않는다(`running`이 아니면 무시한다).

## 남아 있는 것

- **실행 로그를 우리 쪽으로 가져오지 않는다.** 사유에 남는 실행 주소를 눌러 GitHub에서 본다.
  로그를 `LOG_ENTRIES`에 적재하려면 Actions 쪽에서 우리 로그 수집 엔드포인트를 부르게 해야
  하는데, 그러려면 API 키를 사용자 레포 시크릿에 넣어야 한다 — 별도 결정이 필요하다.
- **빌드 산출물(이미지)을 어디에도 올리지 않는다.** 지금 실행의 의미는 "이 설정이 실제로
  빌드되는가"까지다. 레지스트리에 올리려면 자격증명 설계가 먼저다.
- **취소 경로가 없다.** 시작한 실행을 Muster에서 멈출 수 없다. GitHub에서 직접 취소하면
  그 결과(cancelled)가 웹훅으로 돌아와 구성은 failed가 된다.
