# 에이전트 토큰 사용량 실측 연동 (Claude Code 훅)

프로젝트 상세 화면의 "토큰 사용량" 카드는 `AGENT_RUNS` 집계다. 이 테이블은 설계상
자진신고다 — 외부 에이전트가 `X-API-Key`로 직접 실행 시작/종료를 기록해야 값이 쌓인다
(설계서 Part 4 §6). 그런데 지금까지 그 API를 실제로 호출하는 클라이언트가 없어서 카드가
항상 0이었다. 이 문서는 Claude Code를 그 클라이언트로 쓰는 방법이다.

## 준비

1. Muster에서 프로젝트 상세 → 에이전트 등록 (이름은 자유, 예: `claude-code`).
2. 같은 프로젝트에서 API 키 발급 — **응답에 뜨는 키 원문은 그때 한 번만 보인다.**
3. 에이전트 id와 API 키를 적어 둔다.

## 레포에 연결

작업할 레포 루트에 `.muster/config.json`을 만든다 (커밋하지 않는다 — API 키가 들어간다):

```json
{
  "apiUrl": "https://<muster-서비스-주소>/api/v1",
  "apiKey": "muster_...",
  "agentId": "<위에서 등록한 에이전트 id>"
}
```

`.gitignore`에 `.muster/config.json`을 추가할 것. 이 파일이 없으면 스크립트는
`MUSTER_API_URL` / `MUSTER_API_KEY` / `MUSTER_AGENT_ID` 환경변수로 폴백한다 — 한 대의
머신에서 프로젝트 하나만 추적한다면 훅을 전역으로 걸고 환경변수만 설정해도 된다.

## Claude Code 훅 등록

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

같은 스크립트를 두 이벤트에 그대로 건다 — 안에서 `hook_event_name`을 보고 분기한다.
세션이 시작되면 실행을 시작 기록하고(`run_id`를 `~/.muster/runs/<session_id>.json`에
저장), 세션이 끝나면 그 파일을 읽어 transcript의 토큰 사용량을 합산해 실행을 끝맺는다.

## 알아 둘 것

- **`.muster/config.json`도 훅 환경변수도 없는 레포에서는 조용히 아무 일도 하지 않는다.**
  훅은 전역으로 걸리므로, Muster로 추적하지 않는 레포에서 매번 실패 로그를 남기면 안 된다.
- **훅은 절대 세션을 막지 않는다.** 네트워크 오류든 설정 오류든 항상 종료 코드 0으로
  끝나고, 문제는 stderr에만 남는다.
- **토큰 수는 transcript JSONL에서 직접 합산한다** (`type: "assistant"`인 줄의
  `message.usage.{input_tokens,output_tokens,cache_creation_input_tokens,
  cache_read_input_tokens}` 네 필드). 2026-09-16 실제 transcript 파일로 확인한 형태다 —
  Claude Code가 이 스키마를 바꾸면 합산 로직도 같이 손봐야 한다.
- **비용(`cost`)은 기본적으로 비워 둔다.** 모델·플랜마다 단가가 달라 추측해서 채우지
  않는다. `MUSTER_COST_PER_MTOK_INPUT`과 `MUSTER_COST_PER_MTOK_OUTPUT`(1M 토큰당 USD)을
  **둘 다** 환경변수로 주면 그때만 계산한다 — 캐시 생성/읽기 토큰은 입력측 단가로 묶는다
  (출력만 별도 단가가 있는 대부분의 요금제와 맞춘다).
- **컴팩션으로 `SessionStart`가 다시 불려도 실행을 두 번 시작하지 않는다** — 같은
  `session_id`의 상태 파일이 이미 있으면 건너뛴다.
- 실행 상태는 항상 `succeeded`로 끝맺는다. 세션이 에러로 끝났는지는 훅에서 구분할
  방법이 없다 — 필요하면 프로젝트 상세 화면에서 사람이 정정한다(`PATCH /agent-runs/:id`는
  세션 인증도 그대로 받는다).

## 검증

```bash
node --test scripts/claude-code-hooks/report-agent-usage.test.mjs
```

전체 흐름(시작 → transcript 합산 → 종료)은 로컬 API에 실제 프로젝트/에이전트/키를 만들고
`SessionStart`·`SessionEnd` 훅 JSON을 스크립트에 직접 흘려보내 확인했다 — 토큰 수가
transcript 합계와 정확히 일치하고, 비용 요율을 주면 반영되고, 설정 없는 레포는 아무 것도
만들지 않는다.
