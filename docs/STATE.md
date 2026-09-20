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
- **배포**: Cloud Run 리비전 `muster-00048-mvr` (트래픽 100%, 헬스체크 200)
- **DB**: Supabase, 마이그레이션 17개 전부 적용됨
- **코드와 배포는 같다** — PR #87까지 배포됐다.
- **GCS는 더 이상 쓰지 않는다.** 버킷 `muster-docs-taewoo`는 비어 있었고(객체 0개) 삭제했다.
  `GCP_PROJECT_ID`는 남는다 — Vertex AI(Gemini 폴백)와 Secret Manager가 쓴다.

배포 검증(2026-09-20): 지운 엔드포인트가 전부 404(`/documents`·`/projects/:id/documents`·
`PUT /projects/:id/budget` 포함), 남긴 것은 200(공개) 또는 401(인증 요구 — 라우트는 살아
있다는 뜻)을 낸다. SSE 스트림도 401로 살아 있다. 실서버 로그인 화면에 문서·GCS 언급이
없는 것도 브라우저로 확인했다.

## 검증 기준선

```bash
pnpm -r test    # 526개 = API 366 + Web 160
node --test scripts/claude-code-hooks/report-agent-usage.test.mjs \
            scripts/antigravity-hooks/report-agent-usage.test.mjs \
            scripts/muster-connect.test.mjs    # 43개
```

합계 **569개**. e2e는 로컬 Postgres가 필요하며 별도다(`pnpm --filter @muster/api test:e2e`, 183개).

숫자가 715 → 569로, e2e가 243 → 183으로 준 것은 죽은 엔드포인트를 지우면서 그것만
검증하던 테스트가 같이 빠졌기 때문이다(PR #79). 살아 있는 동작을 지운 엔드포인트로
확인하던 테스트는 지우지 않고 DB를 직접 보도록 고쳐 썼다.

숫자가 안 맞으면 먼저 **이 파일이 낡은 것은 아닌지** 의심할 것. 테스트를 지우거나 더한
변경이 이 파일을 갱신하지 않았을 수 있다.

## 최근 반영된 것

| PR | 내용 |
|---|---|
| [#87](https://github.com/twenter1003/Muster/pull/87) | 죽은 SSE 이벤트 4종 정리 — `budget_alert`(체인 전체 + `PUT /budget`)·`stage_change`·아무도 안 듣던 `WORKFLOW_RUN_COMPLETED`·`CODE_PUSHED` |
| [#83](https://github.com/twenter1003/Muster/pull/83) | 문서 기능 접음 — `doc-store` 모듈·GCS 연동·검색의 document 종류·화면의 문서 패널 전부 제거 |
| [#79](https://github.com/twenter1003/Muster/pull/79) | 죽은 엔드포인트 정리 — 모듈 3개(`env-catalog`·`inbox`·`reports`) + 컨트롤러·라우트 다수. 목 서버·스모크 동기화 |
| [#78](https://github.com/twenter1003/Muster/pull/78) | 프로젝트 전용 서브에이전트 2개(`muster-investigator`, `muster-reviewer`) |
| [#77](https://github.com/twenter1003/Muster/pull/77) | 문서 재편 — 18개 3,310줄 → 8개 1,803줄. 이 파일이 그때 생겼다 |
| [#76](https://github.com/twenter1003/Muster/pull/76) | 도달 불가능한 화면 11개 + 딸린 죽은 코드 삭제 (11,048줄). 그 영향으로 Web 테스트 236→161 |
| [#75](https://github.com/twenter1003/Muster/pull/75) | 토큰 리포팅 로직 4중 중복 정리, 백필 파서 통일, `hook_version` 배너. 스키마 +1 |

이 과정에서 `scripts/backfill-claude-tokens.mjs`에 프로덕션 DB 비밀번호가 평문으로 커밋돼
있던 것이 발견돼 **비밀번호를 로테이션했다**(2026-09-20). 옛 비밀번호는 무효다. git
히스토리에는 문자열이 남아 있으나 죽은 값이다.

## 쓸 수 있는 서브에이전트

`.claude/agents/`에 두 개가 정의돼 있다(PR #78). **정의는 세션 시작 시점에 읽히므로**
받은 직후 세션에서는 안 잡힌다 — 재시작하면 쓸 수 있다.

- `muster-investigator` — "이게 실제로 쓰이나", "누가 부르나", "지우면 뭐가 깨지나". 읽기 전용.
- `muster-reviewer` — PR 전 diff 리뷰. 이 저장소 고유의 함정을 안다.

**조사 결과를 그대로 믿고 지우지 않는다.** 2026-09-20 감사에서 조사 에이전트 3개 중 1개가
살아 있는 엔드포인트 4개를 "미사용"으로 보고했다. 파괴적 작업 전에는 메인 세션이 직접
확인한다 — 그래서 investigator 정의가 "확인하지 않은 것"을 반드시 밝히게 돼 있다.

## 다음 과제

엔드포인트 정리는 끝났다(PR #79). 지금 살아 있는 표면은
[ARCHITECTURE.md](ARCHITECTURE.md)가 원천이다. 남은 것으로 확인된 것들:

- **테이블 6개가 읽는 코드 없이 남아 있다** — `env_templates`·`project_env_configs`·
  `env_config_transitions`·`policy_check_results`·`documents`·`project_budgets`. 코드만 지우고 테이블은
  남기기로 한 결과다. 지우려면 마이그레이션 18번이 필요하고, 엔티티 쪽에서 끊어야 할
  관계는 둘이다(2026-09-20 확인) — `user.entity.ts:40`의 `env_templates`,
  `project.entity.ts:55`의 `budget`. `Document`는 `Project`를 단방향 `ManyToOne`으로만
  참조하므로 문서 쪽에는 끊을 관계가 없다.

## 작업 관례

- **한국어로 쓴다** — 사용자 응답·커밋 메시지·PR 본문 전부.
- **세션 내 완결**: 테스트 → 브랜치 커밋 → 푸시 → PR → CI → 머지 → 배포 → `main` 동기화.
  끝에 `git log origin/main..HEAD`로 남은 것이 없는지 확인한다(과거에 6커밋이 붕 뜬 적 있다).
- **근거 없는 숫자를 만들지 않는다** — 단가는 [LLM_ECOSYSTEM_GUIDE.md](LLM_ECOSYSTEM_GUIDE.md)가
  단일 원천이다. 출처가 없으면 비워 두거나 비싸게 잡는다.
- **훅을 고치면 임베딩 동기화**: `node scripts/sync-embedded-hooks.mjs` (CI가 `--check`로 막는다).
- **`pnpm lint`는 CI와 같은 것을 검사한다.** 두 번 어긋나서 두 번 CI를 버렸다 — api는
  lint가 `src`만 보는데 CI는 `src test`를 봤고(PR #79), web은 CI가 `prettier --check`를
  **별도 단계로** 돌리는데 로컬 lint에는 그게 없었다(PR #83). 둘 다 스크립트를 CI와
  맞췄다. 워크플로의 명령을 바꾸면 `apps/*/package.json`도 같이 고칠 것.
- **프론트엔드를 고치면 눈으로 확인한다** — 목 서버 + 스크린샷([RUN.md](RUN.md)).
- 코드를 고친 뒤 `graphify update .`
