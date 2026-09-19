import { useState } from 'react';
import { Button } from './Button';
import { ApiError, apiPost, type Page as ApiPage } from '../lib/api';
import { useApi } from '../lib/useApi';
import { EM_DASH } from '../lib/domain';
import { formatDateTime, type AgentView, type RunView } from './ProjectOverviewShared';
import { CorrectRunDialog } from './CorrectRunDialog';

/**
 * 에이전트 한 줄과 그 실행 기록.
 *
 * 실행을 줄마다 두는 이유: POST /agents/:id/runs는 대상 에이전트가 있어야 성립한다.
 * 화면 머리의 버튼 하나로는 대상을 고를 수 없어, 선택이 곧 클릭이 되도록 줄로 내렸다.
 */
export function AgentRow({ agent }: { agent: AgentView }) {
  const runs = useApi<ApiPage<RunView>>(`/agents/${agent.id}/runs?limit=5`);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<RunView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost<RunView>(`/agents/${agent.id}/runs`);
      // 서버가 쓴 줄을 다시 읽는다 — 받은 응답으로 목록을 흉내 내면 화면과 기록이 갈린다.
      runs.reload();
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'INTERNAL', String(e)));
    } finally {
      setBusy(false);
    }
  };

  const items = runs.data?.items ?? [];

  return (
    <div className="po-agent">
      {correcting !== null && (
        <CorrectRunDialog
          run={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={() => {
            setCorrecting(null);
            // 서버가 ended_at 같은 파생 값을 함께 바꾼다. 응답으로 한 줄만 갈아 끼우면
            // 화면이 반쯤 낡는다.
            runs.reload();
          }}
        />
      )}
      <div className="po-list__row">
        <span className="po-mono">{agent.name}</span>
        <span>최근 변경 {formatDateTime(agent.updated_at)}</span>
        <Button onClick={() => void start()} disabled={busy}>
          {busy ? '시작 중…' : '실행'}
        </Button>
      </div>

      {error !== null && (
        <p className="meta error-note" role="alert">
          실행을 시작하지 못했다 — {error.status} {error.code} {error.message}
        </p>
      )}

      {runs.error !== null ? (
        <p className="meta po-note">실행 기록을 불러오지 못했다 — {runs.error.message}</p>
      ) : items.length === 0 ? (
        <p className="meta po-note">실행 기록이 없다.</p>
      ) : (
        <ul className="po-runs">
          {items.map((r) => (
            <li className="po-runs__row" key={r.id}>
              <span className="po-mono">{r.status}</span>
              <span className="meta">시작 {formatDateTime(r.started_at)}</span>
              {/* 끝나지 않은 실행의 종료 시각은 0이 아니라 —다(아직 일어나지 않은 일). */}
              <span className="meta">
                종료 {r.ended_at === null ? EM_DASH : formatDateTime(r.ended_at)}
              </span>
              <span className="meta">
                {r.tokens_used} 토큰 · ${r.cost}
              </span>
              <Button onClick={() => setCorrecting(r)}>정정</Button>
            </li>
          ))}
        </ul>
      )}

      {/*
        실행을 **끝내는** 쪽은 아직 아무도 없다. 실행 어댑터가 없어(기술 사양서 9장 미해결)
        여기서 시작한 실행은 누군가 PATCH /agent-runs/:id로 정정하기 전까지 running으로 남는다.
        화면 문구가 이 사실을 감추지 않도록, 시작을 "실행 완료"라고 쓰지 않는다.
      */}
      <p className="meta po-note">
        시작 기록만 남는다. 실행을 끝내는 어댑터가 아직 없어, 결과는 줄마다 정정해 넣는다.
      </p>
    </div>
  );
}
