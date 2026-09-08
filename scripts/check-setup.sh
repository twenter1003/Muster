#!/usr/bin/env bash
#
# 데스크톱 설정 진행 상황을 확인한다. 시크릿 값은 출력하지 않고 채워졌는지만 본다.
# 자세한 절차는 docs/DESKTOP_SETUP.md 참조.

cd "$(dirname "$0")/.." || exit 1

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
todo() { printf '  \033[33m·\033[0m %s\n' "$1"; }

envval() { grep -E "^$1=" apps/api/.env 2>/dev/null | cut -d= -f2-; }

echo "Muster 설정 상태"
echo

echo "Phase 3 — GitHub OAuth"
[ -n "$(envval GITHUB_OAUTH_CLIENT_ID)" ] && ok "CLIENT_ID 설정됨" || todo "CLIENT_ID 비어 있음 — apps/api/.env"
[ -n "$(envval GITHUB_OAUTH_CLIENT_SECRET)" ] && ok "CLIENT_SECRET 설정됨" || todo "CLIENT_SECRET 비어 있음 — apps/api/.env"

echo
echo "Phase 4 — GCS"
if gcloud auth list --format='value(account)' 2>/dev/null | grep -q .; then
  ok "gcloud 로그인됨 ($(gcloud auth list --format='value(account)' 2>/dev/null | head -1))"
  [ -n "$(envval GCS_BUCKET)" ] && ok "GCS_BUCKET 설정됨" || todo "버킷 미생성 — ./scripts/setup-gcs.sh <프로젝트ID> <버킷이름>"
else
  todo "gcloud 미로그인 — gcloud auth login"
fi

echo
echo "Phase 5 — Gemini / Policy Gate"
[ -n "$(envval GEMINI_API_KEY)" ] && ok "GEMINI_API_KEY 설정됨" || todo "Gemini 키 없음 — https://aistudio.google.com/apikey"
command -v trivy >/dev/null && ok "trivy 설치됨" || todo "trivy 미설치 (로컬 설치 여부는 Phase 5에서 결정)"
command -v conftest >/dev/null && ok "conftest 설치됨" || todo "conftest 미설치 (동상)"

echo
echo "Phase 7 — 배포"
if git remote | grep -q .; then ok "git 원격 있음 ($(git remote get-url "$(git remote | head -1)" 2>/dev/null))"
else todo "git 원격 없음 — GitHub 레포 생성 후 git remote add origin <url>"; fi

echo
echo "선택 — Remote Control"
if claude auth status 2>/dev/null | grep -q '"loggedIn": true'; then ok "Claude CLI 로그인됨"
else todo "Claude CLI 미로그인 — claude auth login (그 다음 claude --remote-control)"; fi
