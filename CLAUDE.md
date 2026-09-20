# Muster

GitHub 레포를 연동하면 커밋·배포·로그·에러·LLM 토큰/비용·목표 달성률을 한 화면에서 보는
**개인용** 관제 대시보드. NestJS(API) + React(Web) + Node 훅 스크립트, Cloud Run + Supabase.

## 무엇을 찾으면 어디로

| 알고 싶은 것 | 문서 |
|---|---|
| 지금 뭐가 배포돼 있나, 다음에 뭘 하나, 테스트 몇 개 통과하나 | [docs/STATE.md](docs/STATE.md) |
| 이 코드가 실제로 쓰이나, 화면·엔드포인트는 뭐가 살아 있나 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 어떻게 돌리나, 테스트·목 서버·마이그레이션 | [docs/RUN.md](docs/RUN.md) |
| 어떻게 배포하나, 시크릿·롤백 | [docs/DEPLOY.md](docs/DEPLOY.md) |
| 토큰은 어떻게 수집되나, 훅·백필·`hook_version` | [docs/AGENT_TOKEN_REPORTING.md](docs/AGENT_TOKEN_REPORTING.md) |
| 단가는 얼마인가 (**숫자의 단일 원천**) | [docs/LLM_ECOSYSTEM_GUIDE.md](docs/LLM_ECOSYSTEM_GUIDE.md) |
| 왜 이렇게 되어 있나, 설계서와 뭐가 다른가 | [docs/DESIGN_DRIFT.md](docs/DESIGN_DRIFT.md) |
| 장애가 났다 | [docs/BUG_REPORTS.md](docs/BUG_REPORTS.md) |

**세션마다 갱신하는 문서는 `STATE.md` 하나다.** 나머지는 그것이 설명하는 대상이 실제로
바뀔 때만 고친다. 예전에는 세션마다 서너 개를 같이 고치라고 시켰고, 그래서 서로 어긋났다.

## 일하는 방식

- **한국어로 쓴다** — 응답·커밋 메시지·PR 본문 전부.
- **세션 내 완결**: 테스트 → 브랜치 커밋 → 푸시 → PR → CI → 머지 → 배포 → `main` 동기화.
- **근거 없는 숫자를 만들지 않는다.** 모르면 "모름"이라고 적는다. 단가는 위 가이드가 원천이다.
- **프론트엔드를 고쳤으면 눈으로 확인한다** — 목 서버 + 스크린샷.
- 자세한 관례는 [docs/STATE.md](docs/STATE.md) 맨 아래.

## graphify (선택 도구)

`graphify-out/`에 코드 지식 그래프가 있다(마지막 빌드 기준 노드 2,581개 — `graphify update .`을
돌릴 때마다 바뀌는 값이라 대략의 규모로만 읽을 것).

**넓은 질문에 쓴다** — "이 코드베이스가 전체적으로 어떻게 생겼나":
`graphify query "<질문>"` · `graphify explain "<개념>"` · `graphify path "<A>" "<B>"` ·
`graphify-out/GRAPH_REPORT.md`

**좁은 질문에는 쓰지 않는다** — "이 심볼을 누가 import하나", "이 엔드포인트를 누가 부르나"
류는 `grep`·`rg`·타입체커가 더 빠르고 정확하다. 2026-09-20 감사에서 확인했다: 그래프 질의는
무관한 노드를 섞어 오고 결과가 잘린 반면, import를 훑는 10줄짜리 셸 루프가 죽은 코드
7,400줄을 2분 만에 확정했다.

코드를 고친 뒤 `graphify update .` (AST만 쓰므로 API 비용 없음). 그래프는 마지막 빌드
시점의 스냅샷이다 — 방금 고친 파일은 그래프 말고 파일을 직접 본다.
