#!/usr/bin/env bash
#
# GCS 버킷 + 서비스 계정 + CORS를 한 번에 구성한다 (Phase 4 DocStore 전제).
#
# 사전 조건 (사람이 직접 해야 하는 것):
#   1. GCP 프로젝트 생성 + 결제 계정 연결
#   2. gcloud auth login   ← 대화형 로그인이라 스크립트로 대신할 수 없음
#
# 사용법:
#   ./scripts/setup-gcs.sh <project-id> <bucket-name> [region]
#
# 여러 번 실행해도 안전하다(멱등). 이미 있는 리소스는 건너뛴다.

set -euo pipefail

PROJECT_ID="${1:-}"
BUCKET="${2:-}"
# 기본값은 Always Free 대상 리전이다. 무료 한도: Standard 5GB-월, Class A 5천/월,
# Class B 5만/월, 북미발 아웃바운드 100GB/월. 대상은 us-central1/us-west1/us-east1 뿐이다.
#
# 미국에 둬도 서버 비용이 늘지 않는다 — 파일 바이트는 브라우저와 GCS가 signed URL로 직접
# 주고받고 Cloud Run은 URL만 발급하기 때문이다. 한국에서의 왕복 지연(약 150~200ms)만 붙는다.
# 큰 바이너리를 자주 받게 되면 asia-northeast3(서울)로 새 버킷을 만들어 복사한다.
#
# 버킷 리전은 생성 후 변경할 수 없다.
REGION="${3:-us-central1}"
SA_NAME="muster-api"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if [[ -z "$PROJECT_ID" || -z "$BUCKET" ]]; then
  echo "사용법: $0 <project-id> <bucket-name> [region]" >&2
  echo "예:    $0 muster-470101 muster-docs-taewoo" >&2
  echo "       $0 muster-470101 muster-docs-taewoo asia-northeast3" >&2
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  echo "먼저 로그인이 필요합니다:  gcloud auth login" >&2
  exit 1
fi

echo "==> 프로젝트 설정: $PROJECT_ID"
gcloud config set project "$PROJECT_ID" --quiet

echo "==> 필요한 API 활성화"
# storage: 버킷/객체, iamcredentials: 키 파일 없이 signed URL에 서명하기 위함
gcloud services enable storage.googleapis.com iamcredentials.googleapis.com --quiet

echo "==> 버킷 생성: gs://$BUCKET ($REGION)"
if gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  echo "    이미 존재 — 건너뜀"
else
  # public-access-prevention: 문서는 signed URL로만 접근한다. 공개 노출 원천 차단.
  # uniform-bucket-level-access: 객체별 ACL 대신 IAM으로만 권한을 관리한다.
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$REGION" \
    --default-storage-class=STANDARD \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

echo "==> 서비스 계정 생성: $SA_EMAIL"
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo "    이미 존재 — 건너뜀"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Muster API" --quiet
fi

echo "==> 버킷 권한 부여 (프로젝트 전체가 아니라 이 버킷에만)"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.objectAdmin" --quiet >/dev/null

echo "==> 키 없이 signed URL에 서명할 수 있도록 자기 자신에 대한 서명 권한 부여"
# JSON 키 파일은 그 자체가 평문 자격증명이라 만들지 않는다 (설계서 Part 2 §6.2).
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet >/dev/null

echo "==> CORS 설정"
# 브라우저가 signed URL로 GCS에 직접 PUT 하므로 CORS가 없으면 업로드가 무조건 실패한다.
CORS_FILE="$(mktemp -t muster-cors)"
cat > "$CORS_FILE" <<'JSON'
[
  {
    "origin": ["http://localhost:5173"],
    "method": ["PUT", "GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
JSON
gcloud storage buckets update "gs://$BUCKET" --cors-file="$CORS_FILE" --quiet
rm -f "$CORS_FILE"

echo
echo "완료. apps/api/.env 에 아래 두 줄을 추가하세요:"
echo
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCS_BUCKET=$BUCKET"
