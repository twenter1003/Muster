#!/usr/bin/env bash
#
# Cloud Run 배포. 무료 한도 안에서 도는 것을 전제로 값을 고정한다.
#
# 쓰기 전에 docs/DEPLOY.md를 먼저 읽을 것 — 이 스크립트가 하지 않는 일(Supabase 만들기,
# 시크릿 넣기, GitHub OAuth 콜백 등록, 마이그레이션)이 거기 있다.
set -euo pipefail

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-asia-northeast3}"
SERVICE="${SERVICE_NAME:-muster}"
REPO="${AR_REPO:-muster}"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "GCP 프로젝트가 정해지지 않았다. gcloud config set project <id>" >&2
  exit 1
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api"
TAG="$(git rev-parse --short HEAD)"

# 자기 주소를 서버가 알아야 한다 — OAuth 리다이렉트 URL을 만들 때 쓰고, 로그인 뒤 돌려보낼
# 곳이기도 하다. 그런데 주소는 배포가 끝나야 나오고, 배포는 이 값 없이는 기동조차 못 한다
# (env.schema가 URL 형식을 요구해서 빈 값이면 검증에서 죽는다).
#
# Cloud Run의 주소가 결정적이라 그 고리를 끊을 수 있다:
#   https://<서비스>-<프로젝트번호>.<리전>.run.app
# 이미 배포된 적이 있으면 실제 주소를 읽어 쓰고(리전·이름을 바꿨을 때 예측이 틀릴 수 있다),
# 없으면 위 형식으로 짓는다. 둘 다 환경변수로 덮어쓸 수 있다.
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
EXISTING_URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)' 2>/dev/null || true)"
SERVICE_URL="${FRONTEND_URL:-${EXISTING_URL:-https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app}}"

echo "프로젝트 ${PROJECT} · 리전 ${REGION} · 이미지 ${IMAGE}:${TAG}"
echo "서비스 주소 ${SERVICE_URL}"

# 커밋 해시를 태그로 쓴다. latest만 쓰면 "지금 도는 것이 어느 커밋인가"에 답할 수 없고,
# 롤백할 때 되돌릴 대상이 없다.
#
# --platform linux/amd64: Cloud Run은 x86만 돈다. 애플 실리콘에서 그냥 빌드하면 arm64
# 이미지가 올라가고, 배포는 성공한 뒤 기동에서 exec format error로 죽는다.
docker build \
  --platform linux/amd64 \
  --target production \
  -t "${IMAGE}:${TAG}" \
  -t "${IMAGE}:latest" \
  -f apps/api/Dockerfile .

docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"

# 비용을 0으로 묶는 값들. 바꾸기 전에 무엇이 늘어나는지 알고 바꿀 것.
#
#   min-instances=0   안 쓰면 인스턴스가 0으로 내려가 과금이 멈춘다. 1로 올리는 순간
#                     상시 과금이 시작된다 — 무료 한도를 하루 만에 태우는 가장 흔한 실수다.
#   max-instances=1   **비용이 아니라 정합성 때문에 1이다.** Realtime의 SSE는 인프로세스
#                     EventEmitter2를 구독하고, 인프로세스 이벤트는 인스턴스를 건너가지
#                     않는다. 2면 A가 받은 웹훅이 B에 붙은 SSE 클라이언트에 영영 안 간다 —
#                     로그·헬스·단계 변경·예산 경보가 사람에 따라 안 오는 상태가 되고,
#                     그 상태는 에러도 안 낸다. 올리려면 먼저 이벤트 발행부를 Pub/Sub으로
#                     바꿔야 한다(README '배포 제약', 설계서 Part 2 8장).
#   memory=512Mi      무료 한도는 GiB-초로 센다. 필요 이상으로 크게 잡으면 같은 요청이
#                     더 많은 한도를 먹는다.
#   concurrency=80    한 인스턴스가 동시에 받는 요청. 기본값이며, 낮추면 인스턴스가 더 뜬다.
#   allow-unauthenticated  공개해야 한다. 남에게 보여 주는 것이 이 배포의 목적이다.
#                     (앱 자체의 인증은 그대로 살아 있다 — 이건 Cloud Run 앞단 이야기다.)
#
# 환경변수는 --set-env-vars 하나로 넘긴다. gcloud가 --set-*와 --update-*를 함께 받지 않기도
# 하지만, 그보다 set이 선언적이라는 점이 중요하다 — 이전 배포에서 넣었다가 지금 스크립트에
# 없는 변수가 조용히 남아 있지 않는다.
gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "${IMAGE}:${TAG}" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 60 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,SECRETS_BACKEND=gcp,GCP_PROJECT_ID=${PROJECT},FRONTEND_URL=${SERVICE_URL},API_BASE_URL=${API_BASE_URL:-${SERVICE_URL}}" \
  --set-secrets "DATABASE_URL=muster-database-url:latest,GITHUB_OAUTH_CLIENT_ID=muster-github-client-id:latest,GITHUB_OAUTH_CLIENT_SECRET=muster-github-client-secret:latest,OAUTH_STATE_SECRET=muster-oauth-state-secret:latest"

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
echo
echo "배포됨: ${URL}"
echo "헬스체크: $(curl -s -o /dev/null -w '%{http_code}' "${URL}/api/v1/health")"

if [[ "${URL}" != "${SERVICE_URL}" ]]; then
  echo
  echo "주의: 실제 주소(${URL})가 배포에 넣은 값(${SERVICE_URL})과 다르다."
  echo "실제 주소로 한 번 더 배포할 것:  FRONTEND_URL=${URL} $0"
else
  echo "GitHub OAuth 콜백: ${URL}/api/v1/auth/github/callback"
fi
