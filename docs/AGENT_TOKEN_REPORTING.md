# 에이전트 토큰 사용량 실측 연동 (Claude Code & Antigravity)

프로젝트 상세 화면의 "토큰 사용량" 카드는 `AGENT_RUNS` 집계다. 이 테이블은 외부 에이전트가 `X-API-Key`로 실행 시작/종료를 기록해야 값이 쌓인다(설계서 Part 4 §6).

Muster는 **1줄 연동 CLI (`npx muster-connect`)**를 통해 **Claude Code**와 **Antigravity(Gemini)** 모두의 실시간 세션 토큰 리포팅 및 과거 세션 토큰 백필을 완전 자동화합니다.

---

## 1. 초간단 1줄 연동 (`npx muster-connect`)

Muster 웹 대시보드의 **프로젝트 상세 화면 헤더 [API 키 관리] 버튼**을 누르면 새 API 키를 1클릭 발급받을 수 있으며, 즉시 실행할 수 있는 완성된 연동 명령어를 복사할 수 있습니다.

### 방법 A: 🚀 전역 1회 자동 라우팅 연동 (가장 추천)
맥북에 한 번만 등록해 두면, **앞으로 어떤 Git 레포지토리에서든** Claude Code나 Antigravity로 작업한 토큰이 Git remote 주소를 감지하여 각 프로젝트 대시보드로 자동 분류 및 적재됩니다 (개별 레포 폴더마다 설정할 필요가 없습니다):

```bash
npx muster-connect --global --key="muster_xxx" --tools=both --yes
```

### 방법 B: 📁 현재 레포 전용 대화형 연동
특정 레포지토리 폴더에만 설정을 두고 싶은 경우, 해당 폴더에서 실행합니다:

```bash
npx muster-connect
# 또는 비대화형:
npx muster-connect \
  --url="https://muster-xcswvn6m2q-du.a.run.app" \
  --key="muster_xxx" \
  --project="<PROJECT_UUID>" \
  --tools="both" \
  --yes
```

### CLI 대화형 안내 흐름:
1. **Muster API URL 입력** (기본값: `https://muster-xcswvn6m2q-du.a.run.app`)
2. **Muster API Key 입력** (프로젝트 상세 → [API 키 관리] 버튼 클릭 후 발급)
3. **Muster Project ID 입력** (UUID)
4. **연동 대상 도구 선택** (`all` / `claude` / `antigravity`)
5. 자동 작업 수행:
   - Muster API에서 에이전트(`claude-code`, `antigravity`) 존재 확인 및 미존재 시 자동 등록
   - `.muster/config.json` 로컬 설정 생성 및 `.gitignore`에 자동 추가
   - Claude Code 훅(`.claude/settings.json`) 자동 등록 (`SessionStart`, `SessionEnd`)
   - Antigravity 훅(`.agents/hooks.json` 및 `~/.gemini/config/hooks.json`) 자동 등록 (`Stop`)
   - 과거 세션 자동 스캔 및 토큰 백필 질의 (`y` 선택 시 즉시 DB 백필)

---

## 2. 수동 설정 안내

자동 연동 CLI 대신 수동으로 설정하고 싶은 경우 아래 단계를 따릅니다.

### 2.1 레포에 연결 (.muster/config.json)

작업할 레포 루트에 `.muster/config.json`을 만듭니다 (커밋하지 않습니다 — API 키가 포함되므로 `.gitignore` 대상):

```json
{
  "apiUrl": "https://<muster-서비스-주소>/api/v1",
  "apiKey": "muster_...",
  "projectId": "<프로젝트 UUID>",
  "agents": {
    "claude-code": "<claude-code 에이전트 UUID>",
    "antigravity": "<antigravity 에이전트 UUID>"
  },
  "agentId": "<기본 에이전트 UUID>"
}
```

이 파일이 없으면 스크립트는 `MUSTER_API_URL` / `MUSTER_API_KEY` / `MUSTER_AGENT_ID` 환경변수로 폴백합니다.

---

### 2.2 Claude Code 훅 등록

`.claude/settings.json`(프로젝트 로컬 또는 `~/.claude/settings.json`)에 추가:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node /절대/경로/scripts/claude-code-hooks/report-agent-usage.mjs" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node /절대/경로/scripts/claude-code-hooks/report-agent-usage.mjs" }
        ]
      }
    ]
  }
}
```

- `SessionStart`: 세션 시작 시 실행 시작 기록 (`run_id`를 `~/.muster/runs/<session_id>.json`에 임시 저장).
- `SessionEnd`: 세션 종료 시 transcript JSONL(`type: "assistant"` 줄의 `message.usage`)을 직접 합산해 실행을 종료(`succeeded`)하고 토큰/비용 기록.

---

### 2.3 Antigravity 훅 등록

`.agents/hooks.json`(프로젝트 로컬) 또는 `~/.gemini/config/hooks.json`(전역)에 추가:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "node /절대/경로/scripts/antigravity-hooks/report-agent-usage.mjs" }
        ]
      }
    ]
  }
}
```

- Antigravity는 세션 완료 시 `Stop` 이벤트를 발생시키며, stdin으로 `{ conversationId, workspacePaths, transcriptPath, modelName }`을 전달합니다.
- 스크립트는 `~/.gemini/antigravity/conversations/<conversationId>.db`의 `steps` 테이블 `metadata` BLOB을 **자체 경량 Protobuf 디코더**(Node 내장 `node:sqlite`)로 해석하여 정확한 입력 토큰(Tag 9 sub[2])과 출력 토큰(Tag 9 sub[3])을 추출합니다.
- DB가 없거나 잠겨있을 경우 `transcript.jsonl` 기반 글자 수 환산(4 chars/token)으로 안정적 폴백을 수행합니다.

---

## 3. 웹 대시보드 토큰 관제 및 필터링

웹 대시보드(`/projects/:id`)의 "토큰 사용량 & 컨텍스트 관제" 카드 상단에 도구별 필터 칩이 제공됩니다:

- **[전체 보기]**: 해당 프로젝트에 기록된 모든 도구의 누적/일별 사용량 및 컨텍스트 낭비율 합산
- **[Claude Code]**: Claude Code 세션(`claude-code`)만 분리 집계
- **[Antigravity]**: Antigravity 세션(`antigravity`)만 분리 집계

하단 "최근 세션별 사용 이력" 목록에서는 세션마다 도구 뱃지(`Claude Code` / `Antigravity`)가 붙어 어떤 도구에서 토큰이 소모되었는지 직관적으로 식별할 수 있습니다.

---

## 4. 알아 둘 것 & 설계 원칙

1. **Ponytail 원칙 (Zero External Dependencies)**:
   - CLI(`scripts/muster-connect.mjs`) 및 훅 스크립트(`scripts/antigravity-hooks/`, `scripts/claude-code-hooks/`)는 추가적인 npm 패키지 설치 없이 Node.js 20+ 내장 모듈(`node:readline`, `node:fs`, `node:path`, `node:sqlite`, `fetch`)만으로 동작합니다.
2. **세션 안전 보장 (Exit 0 Guarantee)**:
   - 훅 스크립트는 네트워크 오류, 인증 실패, DB 락 등 어떤 예외가 발생하더라도 항상 `process.exit(0)`으로 정상 종료하며 오류는 stderr에만 기록합니다. 외부 관제 스크립트의 문제로 인해 사용자의 코딩 에이전트 세션이 중단되지 않습니다.
3. **비용(Cost) 정책**:
   - 단가는 모델 및 구독 플랜마다 상이하므로 기본값은 비워두며(`null`), 사용자가 `MUSTER_COST_PER_MTOK_INPUT`과 `MUSTER_COST_PER_MTOK_OUTPUT` 환경변수를 모두 제공했을 때만 수학적으로 정확하게 산출합니다.

---

## 5. 테스트 및 검증

```bash
# Antigravity 훅 및 Protobuf 디코더 단위 테스트
node --test scripts/antigravity-hooks/report-agent-usage.test.mjs

# Claude Code 훅 단위 테스트
node --test scripts/claude-code-hooks/report-agent-usage.test.mjs

# muster-connect CLI 단위 테스트
node --test scripts/muster-connect.test.mjs
```
