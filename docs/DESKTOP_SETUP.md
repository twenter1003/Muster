# 데스크톱에서 해야 하는 작업

모바일에서는 불가능하고 **Mac 앞에서만 할 수 있는 것들**만 모았다.
각 항목에 "이게 없으면 무엇이 막히는지"를 적어 두었으니 우선순위 판단에 쓸 것.

진행 상황은 아무 때나 이걸로 확인한다 (시크릿 값은 출력하지 않는다):

```bash
./scripts/check-setup.sh
```

---

## 1. GitHub OAuth 자격증명 — Phase 3 ✅ 완료 (2026-09-08)

실제 GitHub 호출로 로그인 플로우 전체를 검증했다. `github_login`까지 확인.
아래는 다른 환경에 다시 세팅할 때를 위해 남겨 둔다.

`apps/api/.env`의 두 줄:

```
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
```

- Client Secret을 잃어버렸으면 https://github.com/settings/developers 에서
  **Generate a new client secret**으로 재발급하면 된다. 몇 번이든 가능.
- `.env`는 `.gitignore`에 있어 커밋되지 않는다.
- 등록 시 사용한 Redirect URI: `http://localhost:8080/api/v1/auth/github/callback`
  이 값은 코드에서 `API_BASE_URL + /api/v1/auth/github/callback`으로 만들어진다.
  다른 주소로 배포하면 `API_BASE_URL`도 함께 바꾸고 **GitHub 앱에도 같은 값을 등록**해야 한다
  (GitHub은 authorize와 토큰 교환의 redirect_uri가 다르면 교환을 거부한다).
- 스코프는 코드에서 `read:user`, `admin:repo_hook`을 요청한다. 앱 등록 화면에서 정하는 값이 아니다.

### 값을 채운 뒤 확인

```bash
docker compose up -d
open http://localhost:8080/api/v1/auth/github/login
```

GitHub 인증 화면 → 승인 → `http://localhost:5173/#token=...` 으로 돌아오면 성공이다.
그 토큰으로 확인:

```bash
curl -H "Authorization: Bearer <토큰>" http://localhost:8080/api/v1/auth/me
```

**503이 나오면** `GITHUB_OAUTH_CLIENT_ID`가 비어 있다는 뜻이고, 응답 메시지가 어느 키인지 알려준다.

> 자격증명이 없어도 OAuth 플로우 전체(state 검증·사용자 생성·토큰 보관·세션 발급·리다이렉트)는
> 이미 fake 어댑터로 검증돼 있고, 실제 HTTP 요청 형태(엔드포인트·헤더·본문)는
> GitHub 문서를 근거로 별도 단위 테스트가 고정해 두었다.
> 값을 채우는 것 외에 코드를 고칠 일은 없어야 한다.

## 2. 테스트용 GitHub 레포 — Phase 3 ✅ 완료 (2026-09-08)

`twenter1003/Muster`로 검증 완료. 등록(201)·GitHub 훅 설정 일치·해제(204) 후
고아 훅 0개까지 확인했다.

**주의**: GitHub은 `localhost` 수신 주소를 422로 거부한다. 로컬에서 검증하려면
`cloudflared tunnel --url http://localhost:8080`으로 임시 공개 주소를 만든 뒤
`API_BASE_URL`을 그 주소로 바꿔 재빌드해야 한다. 단 `API_BASE_URL`은 OAuth
redirect_uri에도 쓰이므로, 터널 주소로 바꾼 동안에는 로그인이 깨진다.
**로그인을 먼저 하고 그 다음에 주소를 바꿀 것.**

재검증 절차:

```bash
curl -X POST http://localhost:8080/api/v1/projects/<프로젝트ID>/git-integration \
  -H "Authorization: Bearer <토큰>" -H "Content-Type: application/json" \
  -d '{"repo_url":"https://github.com/<owner>/<repo>"}'
```

성공하면 GitHub 레포의 **Settings → Webhooks**에 항목이 생긴다.
`github.com`의 https 주소만 받는다 (타 호스팅은 설계서 Part 1 §9에서 범위 외).

---

## 3. Remote Control — 개발 편의 (선택) ✅ 완료 (2026-09-08)

데스크톱 앱으로 연결했다. 요점만:

- 설정의 **최상위에 "Remote Control" 항목은 없다.** `설정 → Claude Code` 안에
  "새 세션을 Remote Control에 연결" 토글이 있다.
- Remote Control은 **폴더 단위 동의**다. 전역 토글이 켜져 있어도 그 폴더가
  허용 목록에 없으면 세션이 안 뜬다.
- 세션 단위로는 **제목 표시줄의 배지**를 클릭해 켜고 끈다. fork된 세션은
  전역 토글이 안 먹을 수 있어 배지 쪽을 써야 한다.
- Remote Control을 끄면 그 세션은 자동으로 보관(archive)된다.

아래 CLI 방식은 **별도 세션**을 만든다 — 기존 대화 맥락은 따라가지 않는다.

```bash
claude auth login
```

```bash
claude --remote-control
```

- `rc`가 아니라 `--remote-control` 플래그다.
- 데스크톱 앱 인증과 CLI 인증은 별개다. 앱이 로그인돼 있어도 CLI는 따로 해야 한다.
- 로그인은 브라우저 승인 후 **터미널에 코드를 붙여넣는** 방식이다.
  리다이렉트가 `platform.claude.com`이라 승인은 휴대폰에서도 되지만, 붙여넣기는 Mac에서 해야 한다.
- 먼저 **데스크톱 앱 설정에 Remote Control 항목이 있는지 확인**할 것.
  있으면 CLI 로그인 없이 화면 조작만으로 끝난다.

---

## 4. GCS 버킷 — Phase 4 ✅ 완료 (2026-09-08)

프로젝트 `muster-twent`, 버킷 `muster-docs-taewoo`(**asia-northeast3**).
공개 접근 차단·uniform IAM·서비스 계정·CORS 모두 구성됨.
`GCP_PROJECT_ID`/`GCS_BUCKET`은 `.env`에 반영 완료.

> 서울 리전이라 Always Free(US 3개 리전) 대상이 아니다. 문서 몇 MB면 월 몇 센트
> 수준이고, 대신 왕복 지연이 150~200ms 줄어든다. 리전은 생성 후 변경 불가.

아래는 다른 환경에 다시 세팅할 때를 위해 남겨 둔다.

사전 조건: GCP 프로젝트 생성 + 결제 계정 연결.

```bash
gcloud auth login
```

```bash
./scripts/setup-gcs.sh <프로젝트ID> <버킷이름>
```

- `gcloud`는 이미 설치됨.
- 버킷 이름은 **전역 고유**여야 한다 (예: `muster-docs-taewoo`).
- 기본 리전은 `us-central1` — GCS Always Free(Standard 5GB-월) 대상이 US 3개 리전뿐이라서다.
  서울로 하려면 세 번째 인자로 `asia-northeast3`. **버킷 리전은 생성 후 변경 불가.**
- 스크립트가 버킷·서비스 계정·IAM·CORS를 모두 처리한다. 여러 번 돌려도 안전.
- 끝나면 출력된 두 줄(`GCP_PROJECT_ID`, `GCS_BUCKET`)을 `apps/api/.env`에 추가.

---

## 5. Gemini API 키 — Phase 5 ✅ 완료 (2026-09-09)

https://aistudio.google.com/apikey 에서 발급해 `apps/api/.env`의 `GEMINI_API_KEY`에 넣는다.

- 현행 키는 **`AQ.`로 시작**한다. 예전 `AIza` 형식은 2026-09부로 폐지됐다.
- 길이는 50자 남짓이다. 100자가 넘는 값을 받았다면 키가 아닌 다른 것을 복사한 것이다
  (그 경우 모든 호출이 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED`로 막힌다).
- 확인: `curl -s -o /dev/null -w '%{http_code}' https://generativelanguage.googleapis.com/v1beta/models -H "x-goog-api-key: $KEY` → 200이어야 한다.

키를 비워 두면 Vertex AI로 폴백한다(ADC 인증). 그때는 API를 켜 둬야 한다:

```bash
gcloud services enable aiplatform.googleapis.com --project=<프로젝트ID>
```

호출 방식은 [DESIGN_DRIFT.md](DESIGN_DRIFT.md) 8번 참조 — generateContent가 아니라
Interactions API를 쓴다.

## 6. Trivy / Conftest — Phase 5 (Policy Gate)

**막히는 것**: 정책 검사 실행.

로컬에 설치할지 도커 이미지에만 넣을지 미결정. Phase 5 진입 시 후보를 정리해 결정한다.

```bash
brew install trivy conftest
```

---

## 7. GitHub 원격 레포 + GCP 배포 리소스 — Phase 7 (CI/CD)

**막히는 것**: 배포 파이프라인 전체.

- ✅ 원격 레포 연결됨 — `twenter1003/Muster` (private). `origin/main` 푸시 완료.
- Cloud Run, Cloud SQL, Secret Manager 프로비저닝 필요.
- Cloud Run은 **`max-instances=1`로 고정**해야 한다 — 인프로세스 EventEmitter2 이벤트가
  인스턴스 간 전달되지 않아 SSE가 깨지기 때문 (Phase 1 결정, README 참조).

---

## 요약

| 항목 | 언제까지 | 상태 |
|---|---|---|
| 1. GitHub OAuth `.env` 두 줄 | Phase 3 | ✅ 완료 |
| 2. 테스트용 레포 + 웹훅 검증 | Phase 3 | ✅ 완료 |
| 3. Remote Control | 선택 | ✅ 완료 |
| 4. GCS 버킷 | Phase 4 전 | ✅ 완료 |
| 5. Gemini API 키 | Phase 5 | ✅ 완료 |
| 6. Trivy/Conftest | Phase 5 | ✅ 완료 (API 이미지에 포함) |
| 7. GCP 배포 리소스 | Phase 7 전 | 미착수 (원격 레포만 완료) |

**Phase 3은 닫혔다.** 웹훅 *수신* 엔드포인트(`/api/v1/webhooks/github`)가 없는 것은
정상이다 — `ingest/`는 README 기준 Phase 6 소관이다.
