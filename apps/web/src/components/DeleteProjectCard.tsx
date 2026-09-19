import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { ApiError, apiFetch } from '../lib/api';
import { Card, type ProjectView } from './ProjectOverviewShared';

/* ───────────────────────── 프로젝트 삭제 ─────────────────────────
 * 수정 상자에 넣지 않는다. 이름을 고치러 들어왔다가 지우는 사고를 막으려고 애초에 그렇게
 * 갈라 두었고(EditProjectDialog 주석), 그 판단은 지금도 유효하다.
 *
 * 확인을 이름 입력으로 받는 이유: 이 삭제는 문서·에이전트·실행 기록·로그·감사까지 전부
 * 함께 지운다(FK가 CASCADE다). 버튼 두 번으로 끝나면 무엇이 사라지는지 읽지 않고 누른다.
 */
export function DeleteProjectCard({ project }: { project: ProjectView }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === project.name;

  const remove = () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);

    apiFetch<void>(`/projects/${project.id}`, { method: 'DELETE' }).then(
      // 지운 프로젝트의 상세에 머물면 다음 조회가 전부 404다. 목록으로 돌려보낸다.
      () => navigate('/projects', { replace: true }),
      (err: unknown) => {
        setBusy(false);
        setError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
      },
    );
  };

  return (
    <Card title="프로젝트 삭제">
      <p className="meta po-note po-note--signal">
        이 프로젝트의 문서·에이전트·실행 기록·로그·감사 기록이 함께 사라진다. 되돌릴 수 없다.
      </p>
      <p className="meta po-note">
        지우려면 프로젝트 이름 <strong>{project.name}</strong>을(를) 그대로 입력한다.
      </p>
      <div className="po-danger">
        <input
          aria-label="확인을 위한 프로젝트 이름"
          value={typed}
          disabled={busy}
          placeholder={project.name}
          onChange={(e) => setTyped(e.target.value)}
        />
        <Button onClick={remove} disabled={!matches || busy}>
          {busy ? '지우는 중…' : '삭제'}
        </Button>
      </div>
      {error !== null && (
        <p className="meta po-note po-note--signal" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
