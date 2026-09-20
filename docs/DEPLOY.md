# 배포 — Cloud Run + Supabase (무료)

월 $0을 목표로 한 구성이다. 값을 바꾸기 전에 **무엇이 과금되는지**를 먼저 읽을 것.

## 구성

| 조각 | 무엇 | 무료 한도 | 우리 |
|---|---|---|---|
| Cloud Run | API + 화면(한 컨테이너) | 200만 요청 · 360,000 vCPU-초 · 180,000 GiB-초 | 개인용이라 한참 아래 |
| Artifact Registry | 이미지 | 0.5 GB (**압축 기준**) | 약 135 MB |
| Supabase | Postgres | 500 MB · 5 GB 송신 | 시드 기준 수 MB |
| Secret Manager | 시크릿 4개 | 활성 버전 6개 | 4개 |

## Data API(PostgREST)는 꺼 두었다

Supabase는 `public` 스키마를 PostgREST로 자동 노출한다. 2026-09-20에 **껐다.**

껐던 이유: 보안 어드바이저가 ERROR로 올렸다. 16개 테이블 전부에서 RLS가 꺼진 채 스키마가
노출돼 있었고, `anon` 역할에 **테이블 권한 119개**가 실제로 부여돼 있었다 —
`users`·`sessions`·`project_api_keys`·`audit_logs`가 포함된다. anon 키를 아는 사람이 세션
토큰과 API 키를 읽을 수 있는 상태였다.

RLS 정책을 새로 설계하는 대신 표면 자체를 없앴다. **이 앱은 Supabase의 API 계층을 하나도
쓰지 않는다** — 인증은 자체 GitHub OAuth, 실시간은 인프로세스 `EventEmitter2` 기반 SSE,
DB는 TypeORM이 커넥션 문자열로 직접 붙는다.

끄는 곳: 대시보드 → Integrations → Data API → **Enable Data API** 끄기.

**껐는지 확인할 때 `curl`의 401을 근거로 삼지 말 것** — 켜져 있어도 키 없이 부르면 같은
401이 온다. 확실한 증거는 PostgREST 로그다. 꺼져 있으면 이 오류가 찍힌다:

```
Failed to load the schema cache using db-schemas=pg_pgrst_no_exposed_schemas
```

Supabase가 노출 스키마를 존재하지 않는 이름으로 바꾸기 때문이고, 그래서 유효한 키가 있어도
어떤 테이블도 서빙되지 않는다.

**로그 잡음 처리**: 위 오류가 계속 쌓이므로, 공식 해법대로 빈 스키마를 만들어 그것을
노출시켜 두었다. 스키마가 비어 있어 서빙할 것이 없다.

```sql
create schema if not exists pgrst_no_exposed_schemas;
alter role authenticator set pgrst.db_schemas = 'pgrst_no_exposed_schemas';
notify pgrst;
```

**`anon`과 `authenticated`의 권한 119개씩은 회수했다**(2026-09-20, 마이그레이션 19번
`RevokeAnonPrivileges`·20번 `RevokeAuthenticatedPrivileges`). 현재 권한뿐 아니라 `postgres`
역할의 default privileges도 껐다 — 그러지 않으면 다음 마이그레이션이 만드는 테이블에서
되살아난다. 적용 후 실측으로 둘 다 119 → **0**(시퀀스 권한도 0). 앱은 `postgres` 역할로
붙고 `public` 테이블 소유자도 전부 `postgres`라 영향이 없다(헬스체크 200으로 확인).

| 역할 | `public` 테이블 권한 | 비고 |
|---|---|---|
| `anon` | 0 | 회수함 (19번) |
| `authenticated` | 0 | 회수함 (20번) |
| `service_role` | 119 | **일부러 남겼다** — 아래 |
| `postgres` | 119 | 앱이 쓰는 역할 |

**`service_role`은 남겼다.** 그 키는 공개되는 값이 아니라 서버 전용 시크릿이고 설계상
RLS를 우회하는 관리자 경로다 — 회수해도 얻는 것이 적은 반면 Supabase 자체 기능이 그 경로를
쓰면 깨진다. 이 앱은 그 키를 쓰지 않는다(저장소에 `SUPABASE_*`를 읽는 코드가 없다).

**남아 있는 두 가지.** `supabase_admin`이 설정한 기본 권한은 `anon`·`authenticated`를 포함한
채 그대로다(그 역할로 접속할 수 없어 건드리지 못한다). `postgres`의 함수 기본 권한도
마찬가지다 — 회수 범위를 테이블·시퀀스로 잡았기 때문이다. 둘 다 지금은 영향이 없다:
`public`에 함수가 0개이고, 이 앱의 테이블은 전부 `postgres`가 만든다.

**다시 켠다면 순서가 중요하다.** 켜기 전에 RLS를 켤 것(권한은 회수돼 있으나 `service_role`
경로와 위의 남은 기본 권한이 있다). 그리고 위 설정을 먼저 되돌린다:

```sql
alter role authenticator reset pgrst.db_schemas;
notify pgrst;
```

([Supabase 문서](https://supabase.com/docs/guides/troubleshooting/schema-pg_pgrst_no_exposed_schemas-does-not-exist))

**Cloud SQL은 쓰지 않는다.** 무료 티어가 없고, GCP의 지출 상한이 적용되지 않는 종류의
리소스라 실수하면 멈추지 않고 과금된다.

## 과금을 0으로 묶는 값

`scripts/deploy-cloudrun.sh`에 박혀 있다. 바꾸려면 무엇이 늘어나는지 알고 바꿀 것.

- `--min-instances 0` — 안 쓰면 0으로 내려가 과금이 멈춘다. **1로 올리는 순간 상시 과금**이
  시작된다. 무료 한도를 하루에 태우는 가장 흔한 실수다.
- `--max-instances 1` — **비용이 아니라 정합성 때문에 1이다.** SSE가 인프로세스
  EventEmitter2를 구독하는데 그 이벤트는 인스턴스를 건너가지 않는다. 2면 A가 받은 웹훅이
  B에 붙은 구독자에게 영영 안 가고, 그 실패는 에러를 내지 않는다 — 어떤 사람에게는 실시간이
  오고 어떤 사람에게는 안 온다. 올리려면 이벤트 발행부를 Pub/Sub으로 먼저 바꿔야 한다
  (README '배포 제약', 설계서 Part 2 8장). 무한 확장을 막는 효과는 덤이다.
- `--memory 512Mi` — 무료 한도는 GiB-초로 센다. 크게 잡으면 같은 요청이 한도를 더 먹는다.

## 순서

각 단계에 **누가 하는지**를 적었다. "사람"이라고 적힌 것은 계정 생성과 자격증명 입력이라
자동화하지 않는다.

### 1. Supabase 프로젝트 (사람)

1. <https://supabase.com>에서 GitHub으로 가입하고 프로젝트를 만든다. 리전은 `ap-northeast-2`(서울).
2. Settings → Database → **Connection string → Session pooler**를 복사한다.

**Session pooler여야 한다.** 셋 중 이것만 맞는다:

| 방식 | 포트 | 되는가 |
|---|---|---|
| Direct connection | 5432 | ✗ IPv6 전용 — Cloud Run에서 닿지 않는다 |
| **Session pooler** | **5432** | ✓ IPv4 + prepared statement |
| Transaction pooler | 6543 | ✗ prepared statement 미지원 — TypeORM이 깨진다 |

문자열 끝에 `?sslmode=require`를 붙인다.

### 2. GitHub OAuth 앱 (사람)

<https://github.com/settings/developers>에서 앱을 만들거나 기존 것을 쓴다.
**콜백 주소는 Cloud Run 주소가 나온 뒤(5단계)에 채운다.** 지금은 Client ID와 Secret만 챙긴다.

### 3. GCP 준비 (사람 — 한 번만)

```bash
gcloud config set project <프로젝트 id>
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create muster --repository-format=docker --location=asia-northeast3
gcloud auth configure-docker asia-northeast3-docker.pkg.dev
```

결제 계정이 연결돼 있어야 한다 — 무료 한도 안에서도 필요하다.

### 4. 시크릿 (사람)

값이 셸 기록에 남지 않도록 파일이나 표준입력으로 넣는다.

```bash
printf '%s' 'postgresql://...세션 풀러 문자열...' | gcloud secrets create muster-database-url --data-file=-
printf '%s' '<GitHub Client ID>'                 | gcloud secrets create muster-github-client-id --data-file=-
printf '%s' '<GitHub Client Secret>'             | gcloud secrets create muster-github-client-secret --data-file=-
openssl rand -base64 32                          | gcloud secrets create muster-oauth-state-secret --data-file=-
```

이 넷은 **배포가 주입하는** 시크릿이다. 앱이 **실행 중에 만드는** 시크릿(웹훅 시크릿,
사용자 GitHub 토큰)은 따로 있다 — `SECRETS_BACKEND=gcp`로 켜져 있고, 만들 때마다
`muster-`가 아닌 자기 이름으로 Secret Manager에 들어간다. 그래서 권한이 두 종류다.

Cloud Run의 서비스 계정에 읽기 권한을 준다:

```bash
PROJECT=$(gcloud config get-value project)
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
for s in muster-database-url muster-github-client-id muster-github-client-secret muster-oauth-state-secret; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${NUM}-compute@developer.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor
done
```

**Gemini API 키는 선택이다.** 없어도 `GCP_PROJECT_ID`로 Vertex AI(ADC)를 쓴다
(`common/llm/llm.module.ts` 참조, DESIGN_DRIFT.md 12번). AI Studio 키를 직접 쓰고
싶으면(로컬 테스트에서 이미 쓰고 있는 키를 배포본에도 쓰고 싶을 때) 시크릿을 만들고
같은 방식으로 권한을 준다 — `scripts/deploy-cloudrun.sh`가 이 시크릿이 있으면 자동으로
집어 넣는다(없으면 조용히 건너뛰고 Vertex로 돈다):

```bash
printf '%s' '<Gemini API 키>' | gcloud secrets create muster-gemini-api-key --data-file=-
gcloud secrets add-iam-policy-binding muster-gemini-api-key \
  --member="serviceAccount:${NUM}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

**다음 것은 선택이 아니다.** 위의 `secretAccessor` 부여는 이름을 적어 준 시크릿 넷에만
걸린다. 그런데 앱은 로그인·레포 연동 과정에서 시크릿을 **스스로 만든다**
(`github-token-<사용자id>`, `webhook-secret-<프로젝트id>`) — 그것들에는 아무 바인딩도
없으므로, 프로젝트 수준 권한 없이는 앱이 방금 저장한 값조차 다시 읽지 못한다.
빼먹으면 로그인까지는 되는데 레포 연동이 `secretmanager.versions.access denied`로 죽는다
(실제로 겪은 일이다):

```bash
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${NUM}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.admin
```

**`admin`인 이유**: 앱이 시크릿을 생성(`create`)·회전(`addVersion`)·폐기(`destroy`)·
삭제(`delete`)까지 한다. 이보다 좁은 사전 정의 역할이 없다. 범위가 넓으니 이 서비스
계정을 다른 용도로 재사용하지 말 것 — 전용 서비스 계정을 따로 만들면 더 낫다.

**활성 버전은 시크릿당 1개로 유지된다.** 무료 한도가 활성 버전 6개라, 값을 회전하면
앱이 이전 활성 버전을 폐기한다(`GcpSecretManagerStore`). 폐기된 버전은 한도에 세지 않는다.

### 5. 첫 배포

```bash
./scripts/deploy-cloudrun.sh
```

주소가 나온다. **그 주소로 GitHub OAuth 앱의 Authorization callback URL을 채운다:**
`https://<주소>/api/v1/auth/github/callback`.

주소를 넣어 다시 배포할 필요는 없다. 서버는 OAuth 리다이렉트를 만들 때 자기 주소를 알아야
하는데, 스크립트가 그 값을 스스로 채운다 — 기존 리비전이 있으면 그 주소를, 없으면 Cloud
Run의 결정적 형식(`<서비스>-<프로젝트번호>.<리전>.run.app`)을 쓴다. 주소가 있어야 배포가
뜨고 배포가 떠야 주소가 나오는 고리를 그렇게 끊었다.

예상과 실제 주소가 다르면(리전·서비스 이름을 바꾼 경우) 스크립트가 마지막에 그 사실과
다시 돌릴 명령을 함께 알려 준다. 주소를 직접 정하고 싶으면 덮어쓸 수 있다:

```bash
FRONTEND_URL=https://<주소> ./scripts/deploy-cloudrun.sh
```

### 6. 마이그레이션 (사람, 로컬에서)

**배포가 자동으로 돌리지 않는다.** 배포와 스키마 변경을 한 명령에 묶으면 롤백이 어려워지고,
인스턴스가 여럿일 때 동시에 돌 수 있다.

```bash
DATABASE_URL='postgresql://...세션 풀러 문자열...' pnpm --filter @muster/api migration:run
```

### 7. 정지 막기 (사람 — 한 번만)

**무료 Supabase는 7일간 DB 활동이 없으면 프로젝트를 정지시킨다.** 정지되면 링크를 받은
사람이 열었을 때 앱이 죽어 있고 소유자가 대시보드에서 복구해야 한다.

저장소 Settings → Secrets and variables → Actions → **Variables**에
`DEPLOY_URL = https://<주소>`를 추가한다. `.github/workflows/keepalive.yml`이 주 1회
헬스체크를 때려 DB를 깨운다(헬스체크가 실제로 `SELECT 1`을 돌린다).

### 8. 자동 배포 (사람 — 한 번만, 선택)

`.github/workflows/deploy.yml`이 배포한다. 워크플로도 `./scripts/deploy-cloudrun.sh`를
부르므로, 안 쓰면 사람이 그 스크립트를 직접 돌리면 된다.

**지금은 수동 실행(Actions → 배포 (Cloud Run) → Run workflow)만 걸려 있다.** 아래 변수가
없는 채로 main 푸시에 걸어 두면 모든 푸시가 실패로 끝나고, 늘 실패하는 검사는 곧 아무도
안 보는 검사가 된다. 변수를 채운 뒤 워크플로 상단 주석의 `on:` 블록으로 되돌리면 main
푸시마다 자동 배포된다.

**서비스 계정 키(JSON)를 저장소 시크릿에 넣지 않는다.** 만료가 없어 유출되면 회수 전까지
계속 유효하다. GitHub Actions의 OIDC 토큰을 GCP가 직접 신뢰하게 한다(Workload Identity).

```bash
PROJECT=$(gcloud config get-value project)
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
REPO=twenter1003/Muster    # 이 저장소

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

gcloud iam workload-identity-pools create github --location=global --display-name=GitHub

# attribute-condition이 핵심이다. 없으면 GitHub의 어느 저장소에서 온 토큰이든 받아들인다.
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository' \
  --attribute-condition="assertion.repository=='${REPO}'"

# 배포에 쓸 계정. 런타임 계정(...-compute@)을 그대로 쓰지 않는다 — 그쪽은
# secretmanager.admin을 갖고 있고, 빌드가 그 권한까지 가질 이유가 없다.
gcloud iam service-accounts create muster-deployer --display-name='Muster 배포'
DEPLOYER="muster-deployer@${PROJECT}.iam.gserviceaccount.com"

for r in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${DEPLOYER}" --role="$r"
done

# Cloud Run 서비스가 쓰는 런타임 계정을 배포자가 '지정'할 수 있어야 한다.
gcloud iam service-accounts add-iam-policy-binding "${NUM}-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:${DEPLOYER}" --role=roles/iam.serviceAccountUser

# 이 저장소의 Actions만 위 계정을 가장할 수 있게 묶는다.
gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${NUM}/locations/global/workloadIdentityPools/github/attribute.repository/${REPO}"

echo "GCP_WIF_PROVIDER = projects/${NUM}/locations/global/workloadIdentityPools/github/providers/github"
echo "GCP_SERVICE_ACCOUNT = ${DEPLOYER}"
echo "GCP_PROJECT = ${PROJECT}"
```

마지막 세 줄과 `DEPLOY_URL`을 저장소 Settings → Secrets and variables → Actions →
**Variables**에 넣는다(비밀이 아니라 식별자다). 리전이 서울이 아니면 `GCP_REGION`도 넣는다.

**워크플로가 하지 않는 것**: 마이그레이션(6단계)과 시크릿 주입(4단계). 스키마 변경이
있는 배포는 워크플로가 끝난 뒤 사람이 6단계를 돌린다.

## 확인

```bash
curl -s https://<주소>/api/v1/health          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' https://<주소>/          # 200 (화면)
curl -s https://<주소>/api/v1/nope            # JSON 404 (HTML이면 안 된다)
```

그다음 브라우저로 들어가 GitHub 로그인까지 해본다.

## 비용이 새는지 보기

```bash
gcloud billing accounts list
gcloud beta billing budgets list --billing-account=<계정 id>
```

**예산 알림을 걸어 둘 것.** Cloud Run은 지출 상한을 걸 수 있지만, 걸어도 이미 뜬 요청은
처리된다. 알림이 먼저 오는 편이 낫다.

## 롤백

이미지에 커밋 해시가 태그로 붙어 있다.

```bash
gcloud run services update-traffic muster --region asia-northeast3 --to-revisions=<이전 리비전>=100
```

리비전 목록: `gcloud run revisions list --service muster --region asia-northeast3`

## 남아 있는 제약

- **에이전트 실행 어댑터가 없다.** 환경 구성을 실행하면 `running`에서 멈춘다.
- **Policy Gate가 trivy·conftest를 컨테이너 안에서 직접 부른다.** Cloud Run의 요청 타임아웃
  (60초) 안에 끝나야 하고, 파일시스템은 메모리다. 큰 이미지를 스캔하면 메모리를 먹는다.
- **로컬은 여전히 파일 저장소다.** `SECRETS_BACKEND`를 켜지 않으면 `.secrets/`를 쓴다.
  두 저장소는 참조 접두사(`file://`·`gcp://`)로 갈리므로, 백엔드를 바꾸면 **바꾸기 전에
  만든 연동의 웹훅 시크릿과 GitHub 토큰은 읽히지 않는다**. 연동을 다시 걸어야 한다.
