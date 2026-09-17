#!/usr/bin/env bash
#
# Muster 실서버(Cloud Run) 원클릭 장애 진단 스크립트.
# 버그나 500 에러 발생 시 5초 안에 원인을 진단한다.
#
set -euo pipefail

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo "muster-twent")}"
REGION="${GCP_REGION:-asia-northeast3}"
SERVICE="${SERVICE_NAME:-muster}"

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; }

echo "========================================================"
echo "          Muster 실서버 초고속 진단 (Live Triage)        "
echo "========================================================"
echo "GCP 프로젝트: ${PROJECT} · 리전: ${REGION} · 서비스: ${SERVICE}"
echo

# 1. Cloud Run 서비스 상태 확인
echo "[1/4] Cloud Run 서비스 및 활성 리비전 점검"
if ! gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" &>/dev/null; then
  fail "Cloud Run 서비스를 조회할 수 없습니다. gcloud auth를 확인하세요."
  exit 1
fi

SERVICE_URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
LATEST_REV="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.latestReadyRevisionName)')"
TRAFFIC_SPEC="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.traffic[0].revisionName)')"
TRAFFIC_PCT="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.traffic[0].percent)')"

ok "서비스 URL: ${SERVICE_URL}"
ok "최신 준비 리비전: ${LATEST_REV}"
if [[ "${LATEST_REV}" == "${TRAFFIC_SPEC}" && "${TRAFFIC_PCT}" == "100" ]]; then
  ok "트래픽 100% 정상 서빙 중 (${TRAFFIC_SPEC})"
else
  warn "트래픽 분배 주의: ${TRAFFIC_SPEC} (${TRAFFIC_PCT}%)"
fi
echo

# 2. 실서버 HTTP 헬스체크
echo "[2/4] 핵심 HTTP 엔드포인트 응답 검사"
HEALTH_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/v1/health" || echo "000")"
if [[ "${HEALTH_STATUS}" == "200" ]]; then
  ok "헬스체크 (/api/v1/health): HTTP 200 OK"
else
  fail "헬스체크 실패 (/api/v1/health): HTTP ${HEALTH_STATUS}"
fi

# 3. 보안 가드 및 500 에러 사전 탐지
SUMMARY_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/v1/projects?summary=true" || echo "000")"
if [[ "${SUMMARY_STATUS}" == "401" ]]; then
  ok "보안 가드 검증 (/api/v1/projects?summary=true): HTTP 401 정상 차단 (500 에러 없음)"
elif [[ "${SUMMARY_STATUS}" == "500" ]]; then
  fail "CRITICAL 500 오류 감지! (/api/v1/projects?summary=true): HTTP 500 Server Error"
else
  warn "예상치 못한 응답 (/api/v1/projects?summary=true): HTTP ${SUMMARY_STATUS}"
fi
echo

# 4. 현재 활성 리비전 Cloud Run 오류 로그 (WARNING 이상)
echo "[3/4] 현재 활성 리비전(${LATEST_REV}) 오류 로그 점검"
REV_LOGS="$(gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND resource.labels.revision_name=${LATEST_REV} AND severity>=ERROR" \
  --project "${PROJECT}" --limit 10 --freshness=15m --format="value(textPayload)" 2>/dev/null || true)"

if [[ -z "${REV_LOGS//[[:space:]]/}" ]]; then
  ok "현재 활성 리비전(${LATEST_REV})에 ERROR 로그 없음 (서버 무결점 가동 중)"
else
  fail "현재 리비전에서 ERROR 로그 감지:"
  echo "${REV_LOGS}" | sed 's/^/    /'
fi
echo

# 5. 빠른 해결 가이드
echo "[4/4] 신속 장애 대응 가이드"
echo "  - 실시간 로그 스트리밍: gcloud beta run services logs tail ${SERVICE} --project ${PROJECT} --region ${REGION}"
echo "  - 상세 버그 리포트 런북: docs/BUG_REPORTS.md 참조"
echo "  - 직전 리비전으로 긴급 롤백: gcloud run services update-traffic ${SERVICE} --to-revisions=<이전_리비전>=100 --region ${REGION} --project ${PROJECT}"
echo "========================================================"
