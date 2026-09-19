import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { ApiError, apiPost } from '../lib/api';
import { buildAgentCreate } from '../lib/agentEdit';
import type { AgentView } from './ProjectOverviewShared';

/**
 * 에이전트 등록.
 *
 * 설정(config_md)을 필수로 받지 않는 이유: 서버가 0자를 허용하고, 처음 쓰는 사람에게
 * "마크다운 설정"을 먼저 요구하면 등록 자체를 못 한다. 등록해서 목록에 세워 두고
 * 실행해 보면서 수정으로 채우는 것이 실제 순서다.
 */
export function CreateAgentDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [configMd, setConfigMd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const built = buildAgentCreate({ name, configMd });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!built.ok || saving) return;

    setSaving(true);
    setError(null);
    apiPost<AgentView>(`/projects/${projectId}/agents`, built.body).then(
      onCreated,
      (err: unknown) => {
        setSaving(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  return (
    <Modal open title="에이전트 등록" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        <label className="modal__label" htmlFor="new-agent-name">
          이름
        </label>
        <input
          id="new-agent-name"
          className="input modal__input"
          value={name}
          disabled={saving}
          placeholder="예: 코드 리뷰어"
          onChange={(e) => setName(e.target.value)}
        />

        <label className="modal__label" htmlFor="new-agent-config">
          설정 (마크다운 · 비워도 된다)
        </label>
        <textarea
          id="new-agent-config"
          className="input modal__input"
          rows={8}
          value={configMd}
          disabled={saving}
          placeholder={'# 역할\n무엇을 하는 에이전트인지 적는다.'}
          onChange={(e) => setConfigMd(e.target.value)}
        />

        {!built.ok && <p className="meta">{built.reason}</p>}
        {error !== null && (
          <p className="meta po-note po-note--signal" role="alert">
            {error}
          </p>
        )}

        <div className="modal__actions">
          <Button onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" variant="solid" disabled={!built.ok || saving}>
            {saving ? '등록 중…' : '등록'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
