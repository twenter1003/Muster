# 지금 상태

> **이 저장소에서 세션마다 갱신하는 문서는 이 파일 하나다.**
> 나머지 문서는 *그것이 설명하는 대상이 실제로 바뀔 때만* 바뀐다. 예전에는 세션마다
> HANDOVER·PROMPT·DESIGN_DRIFT를 함께 고치라고 시켰고, 그래서 서로 어긋났다
> (2026-09-20 감사에서 테스트 기준선이 실제와 다른 채 "필수 검증 항목"으로 박혀 있던 것이
> 대표적인 예다).
>
> 여기에 적는 것: 지금 배포된 것, 지금 통과하는 숫자, 다음에 할 일.
> 여기에 **적지 않는 것**: 지난 세션 서사, 이미 끝난 작업의 경위 — 그건 git 로그와 PR에 있다.

- **갱신**: 2026-09-20
- **main**: `1e56272`
- **배포**: Cloud Run 리비전 `muster-00045-5df` (트래픽 100%, 헬스체크 200)
- **DB**: Supabase, 마이그레이션 17개 전부 적용됨

## 검증 기준선

```bash
pnpm -r test    # 672개 = API 511 + Web 161
node --test scripts/claude-code-hooks/report-agent-usage.test.mjs \
            scripts/antigravity-hooks/report-agent-usage.test.mjs \
            scripts/muster-connect.test.mjs    # 43개
```

합계 **715개**. e2e는 로컬 Postgres가 필요하며 별도다(`pnpm --filter @muster/api test:e2e`, 243개).

숫자가 안 맞으면 먼저 **이 파일이 낡은 것은 아닌지** 의심할 것. 테스트를 지우거나 더한
변경이 이 파일을 갱신하지 않았을 수 있다.

## 최근 반영된 것

| PR | 내용 |
|---|---|
| [#76](https://github.com/twenter1003/Muster/pull/76) | 도달 불가능한 화면 11개 + 딸린 죽은 코드 삭제 (11,048줄). 그 영향으로 Web 테스트 236→161 |
| [#75](https://github.com/twenter1003/Muster/pull/75) | 토큰 리포팅 로직 4중 중복 정리, 백필 파서 통일, `hook_version` 배너. 스키마 +1 |

이 과정에서 `scripts/backfill-claude-tokens.mjs`에 프로덕션 DB 비밀번호가 평문으로 커밋돼
있던 것이 발견돼 **비밀번호를 로테이션했다**(2026-09-20). 옛 비밀번호는 무효다. git
히스토리에는 문자열이 남아 있으나 죽은 값이다.

## 다음 과제: 백엔드 엔드포인트 정리

PR #76이 화면 11개를 지우면서, **그 화면만 서빙하던 백엔드가 죽은 채로 남았다.**
[ARCHITECTURE.md](ARCHITECTURE.md)의 "호출되지 않는 엔드포인트" 표가 대상 목록이다.

착수 전 판단할 것:
- `env-catalog` 모듈은 통째로 죽었다 — 엔티티·테이블까지 지우면 마이그레이션이 필요하고,
  되돌리기 비용이 커진다. 코드만 지우고 테이블은 남길지 결정할 것.
- `GET /inbox`는 죽은 사이드바 배지가 쓰던 유일한 소비자였다(PR #76에서 그 사이드바를
  지웠으므로 지금은 호출자가 없다).
- `token-waste-intelligence`·`burn-rate`·`waste-report` 계열은 화면이 `token-usage` 응답
  하나로 다 그리고 있어 호출자가 없다. "계획했다 안 붙인 것"인지 확인이 먼저다.

## 작업 관례

- **한국어로 쓴다** — 사용자 응답·커밋 메시지·PR 본문 전부.
- **세션 내 완결**: 테스트 → 브랜치 커밋 → 푸시 → PR → CI → 머지 → 배포 → `main` 동기화.
  끝에 `git log origin/main..HEAD`로 남은 것이 없는지 확인한다(과거에 6커밋이 붕 뜬 적 있다).
- **근거 없는 숫자를 만들지 않는다** — 단가는 [LLM_ECOSYSTEM_GUIDE.md](LLM_ECOSYSTEM_GUIDE.md)가
  단일 원천이다. 출처가 없으면 비워 두거나 비싸게 잡는다.
- **훅을 고치면 임베딩 동기화**: `node scripts/sync-embedded-hooks.mjs` (CI가 `--check`로 막는다).
- **프론트엔드를 고치면 눈으로 확인한다** — 목 서버 + 스크린샷([RUN.md](RUN.md)).
- 코드를 고친 뒤 `graphify update .`
