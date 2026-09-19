import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { ApiError, apiPatch } from '../lib/api';
import { buildRunPatch } from '../lib/runCorrection';
import { AGENT_RUN_STATUSES, type AgentRunStatus } from '../lib/domain';
import { formatDateTime, type RunView } from './ProjectOverviewShared';

export function CorrectRunDialog({
  run,
  onClose,
  onSaved,
}: {
  run: RunView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AgentRunStatus>(
    AGENT_RUN_STATUSES.includes(run.status as AgentRunStatus)
      ? (run.status as AgentRunStatus)
      : 'running',
  );
  // 토큰·비용은 빈 칸으로 시작한다. 현재 값을 채워 두면 "안 고침"과 "같은 값으로 고침"이
  // 구분되지 않고, 실수로 저장만 눌러도 바뀐 것 없는 요청이 나간다.
  const [tokensUsed, setTokensUsed] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = buildRunPatch(run, { status, tokensUsed, cost });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patch.ok || saving) return;

    setSaving(true);
    setError(null);
    apiPatch<RunView>(`/agent-runs/${run.id}`, patch.body).then(onSaved, (err: unknown) => {
      setSaving(false);
      setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
    });
  };

  return (
    <Modal open title="실행 결과 정정" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        <p className="meta">
          시작 {formatDateTime(run.started_at)} · 현재 {run.tokens_used} 토큰 · ${run.cost}
        </p>

        <label className="modal__label" htmlFor="run-status">
          상태
        </label>
        <select
          id="run-status"
          value={status}
          disabled={saving}
          onChange={(e) => setStatus(e.target.value as AgentRunStatus)}
        >
          {AGENT_RUN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="modal__label" htmlFor="run-tokens">
          토큰 (비우면 그대로)
        </label>
        <input
          id="run-tokens"
          inputMode="numeric"
          value={tokensUsed}
          disabled={saving}
          onChange={(e) => setTokensUsed(e.target.value)}
        />

        <label className="modal__label" htmlFor="run-cost">
          비용 USD (비우면 그대로)
        </label>
        <input
          id="run-cost"
          inputMode="decimal"
          value={cost}
          disabled={saving}
          onChange={(e) => setCost(e.target.value)}
        />

        {/* 무엇이 막고 있는지 저장을 눌러 보기 전에 알려 준다. */}
        {!patch.ok && <p className="meta">{patch.reason}</p>}
        {error !== null && (
          <p className="meta po-note po-note--signal" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <Button onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" variant="solid" disabled={!patch.ok || saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
