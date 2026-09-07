# 데스크톱에서 해야 하는 작업

모바일에서는 불가능하고 **Mac 앞에서만 할 수 있는 것들**만 모았다.
각 항목에 "이게 없으면 무엇이 막히는지"를 적어 두었으니 우선순위 판단에 쓸 것.

---

## 1. GitHub OAuth 자격증명 — Phase 3 마무리

**막히는 것**: OAuth 로그인 플로우의 실제 GitHub 호출 검증. (코드는 fake 어댑터로 이미 검증됨)

OAuth 앱은 이미 등록됨. `apps/api/.env`의 두 줄만 채우면 된다:

```
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
```

- Client Secret을 잃어버렸으면 https://github.com/settings/developers 에서
  **Generate a new client secret**으로 재발급하면 된다. 몇 번이든 가능.
- `.env`는 `.gitignore`에 있어 커밋되지 않는다.
- 등록 시 사용한 Redirect URI: `http://localhost:8080/api/v1/auth/github/callback`

## 2. 테스트용 GitHub 레포 — Phase 3 웹훅 등록

**막히는 것**: `POST /projects/:id/git-integration`의 웹훅 자동 등록 실검증.

아무 레포나 되고 비어 있어도 된다. 레포 URL만 있으면 된다.

---

## 3. Remote Control — 개발 편의 (선택)

**막히는 것**: 없음. 모바일에서 Mac의 Claude를 조작하고 싶을 때만 필요.

CLI는 이미 설치됨(`claude` v2.1.263). 로그인만 하면 된다:

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

## 4. GCS 버킷 — Phase 4 (DocStore)

**막히는 것**: 문서 업로드/조회 전체. Phase 4 진입 전까지는 필요.

사전 조건: GCP 프로젝트 생성 + 결제 계정 연결.

```bash
gcloud auth login
```

```bash
./scripts/setup-gcs.sh <프로젝트ID> <버킷이름>
```

- `gcloud`는 이미 설치됨.
- 버킷 이름은 **전역 고유**여야 한다 (예: `agentops-docs-taewoo`).
- 기본 리전은 `us-central1` — GCS Always Free(Standard 5GB-월) 대상이 US 3개 리전뿐이라서다.
  서울로 하려면 세 번째 인자로 `asia-northeast3`. **버킷 리전은 생성 후 변경 불가.**
- 스크립트가 버킷·서비스 계정·IAM·CORS를 모두 처리한다. 여러 번 돌려도 안전.
- 끝나면 출력된 두 줄(`GCP_PROJECT_ID`, `GCS_BUCKET`)을 `apps/api/.env`에 추가.

---

## 5. Claude API 키 — Phase 5 (EnvCatalog)

**막히는 것**: LLM으로 Dockerfile/compose를 생성하는 기능.

https://console.anthropic.com 에서 발급 후 `apps/api/.env`에 추가.

## 6. Trivy / Conftest — Phase 5 (Policy Gate)

**막히는 것**: 정책 검사 실행.

로컬에 설치할지 도커 이미지에만 넣을지 미결정. Phase 5 진입 시 후보를 정리해 결정한다.

```bash
brew install trivy conftest
```

---

## 7. GitHub 원격 레포 + GCP 배포 리소스 — Phase 7 (CI/CD)

**막히는 것**: 배포 파이프라인 전체.

- 현재 로컬 git만 있다. GitHub 원격 레포 필요.
- Cloud Run, Cloud SQL, Secret Manager 프로비저닝 필요.
- Cloud Run은 **`max-instances=1`로 고정**해야 한다 — 인프로세스 EventEmitter2 이벤트가
  인스턴스 간 전달되지 않아 SSE가 깨지기 때문 (Phase 1 결정, README 참조).

---

## 요약

| 항목 | 언제까지 | 소요 |
|---|---|---|
| 1. GitHub OAuth `.env` 두 줄 | Phase 3 마무리 | 1분 |
| 2. 테스트용 레포 | Phase 3 웹훅 | 1분 |
| 3. Remote Control | 아무때나 (선택) | 3분 |
| 4. GCS 버킷 | Phase 4 전 | 5분 |
| 5. Claude API 키 | Phase 5 전 | 2분 |
| 6. Trivy/Conftest | Phase 5 전 | 2분 |
| 7. 원격 레포 + GCP | Phase 7 전 | 30분+ |
