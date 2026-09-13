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

echo "프로젝트 ${PROJECT} · 리전 ${REGION} · 이미지 ${IMAGE}:${TAG}"

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
#   max-instances=2   최악의 경우를 묶는다. 무한 확장은 곧 청구서다. 개인용이라 2로 충분하다.
#   memory=512Mi      무료 한도는 GiB-초로 센다. 필요 이상으로 크게 잡으면 같은 요청이
#                     더 많은 한도를 먹는다.
#   concurrency=80    한 인스턴스가 동시에 받는 요청. 기본값이며, 낮추면 인스턴스가 더 뜬다.
#   allow-unauthenticated  공개해야 한다. 남에게 보여 주는 것이 이 배포의 목적이다.
#                     (앱 자체의 인증은 그대로 살아 있다 — 이건 Cloud Run 앞단 이야기다.)
gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "${IMAGE}:${TAG}" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --timeout 60 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "DATABASE_URL=muster-database-url:latest,GITHUB_OAUTH_CLIENT_ID=muster-github-client-id:latest,GITHUB_OAUTH_CLIENT_SECRET=muster-github-client-secret:latest,OAUTH_STATE_SECRET=muster-oauth-state-secret:latest" \
  --update-env-vars "FRONTEND_URL=${FRONTEND_URL:-},API_BASE_URL=${API_BASE_URL:-}"

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
echo
echo "배포됨: ${URL}"
echo "헬스체크: $(curl -s -o /dev/null -w '%{http_code}' "${URL}/api/v1/health")"
echo
echo "FRONTEND_URL·API_BASE_URL이 비어 있었다면 위 주소로 다시 배포해야 한다:"
echo "  FRONTEND_URL=${URL} API_BASE_URL=${URL} $0"
