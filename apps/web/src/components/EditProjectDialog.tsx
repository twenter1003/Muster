import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { ApiError, apiPatch } from '../lib/api';
import { PROJECT_STAGES } from '../lib/domain';
import type { ProjectView } from './ProjectOverviewShared';

/* ───────────────────────── 프로젝트 수정 ─────────────────────────
 * 서버가 받는 것은 이름과 진행 단계 둘이다(UpdateProjectDto). 삭제는 여기 두지 않았다 —
 * 수정과 삭제가 같은 상자에 있으면 이름을 고치러 들어왔다가 지우는 사고가 난다.
 */

const PROJECT_NAME_MAX = 200;

export function EditProjectDialog({
  open,
  project,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: ProjectView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [stage, setStage] = useState(project.current_stage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열 때마다 현재 값에서 다시 시작한다. 직전에 고치다 취소한 값이 남아 있으면,
  // 다음에 열었을 때 화면이 서버와 다른 것을 보여 주게 된다.
  useEffect(() => {
    if (open) {
      setName(project.name);
      setStage(project.current_stage);
      setError(null);
    }
  }, [open, project.name, project.current_stage]);

  const trimmed = name.trim();
  const changed = trimmed !== project.name || stage !== project.current_stage;
  const canSave = trimmed.length > 0 && trimmed.length <= PROJECT_NAME_MAX && changed && !saving;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError(null);

    // 바뀐 것만 보낸다. PATCH는 부분 수정이고, 안 바뀐 값을 같이 보내면 그 사이 남이 고친
    // 것을 덮어쓴다.
    const body: { name?: string; current_stage?: string } = {};
    if (trimmed !== project.name) body.name = trimmed;
    if (stage !== project.current_stage) body.current_stage = stage;

    apiPatch<ProjectView>(`/projects/${project.id}`, body).then(onSaved, (err: unknown) => {
      setSaving(false);
      setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
    });
  };

  return (
    <Modal open={open} title="프로젝트 수정" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        <div className="field">
          <label className="meta" htmlFor="edit-project-name">
            이름
          </label>
          <input
            id="edit-project-name"
            className="input modal__input"
            value={name}
            maxLength={PROJECT_NAME_MAX}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="meta" htmlFor="edit-project-stage">
            진행 단계
          </label>
          <select
            id="edit-project-stage"
            className="input modal__input"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {PROJECT_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="meta">바꾸면 단계 이력에 남습니다.</span>
        </div>

        {error !== null && (
          <p className="error-note" role="alert">
            저장하지 못했다: {error}
          </p>
        )}

        <div className="modal__actions">
          <Button type="button" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" variant="solid" disabled={!canSave}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
