import { useState } from 'react';
import { Button } from './Button';
import { ApiError, apiPost } from '../lib/api';

/**
 * 실행용 워크플로를 연동 레포에 넣는 버튼.
 *
 * 여기 두는 이유: 이 파일이 없으면 실행이 404로 죽는데, 그때까지 화면이 할 수 있는 말은
 * "문서를 보고 손으로 복사하라"뿐이었다. 사용자마다 그걸 시키는 것은 온보딩이 아니다.
 * 대신 남의 기본 브랜치에 말없이 커밋하지도 않는다 — 서버가 PR을 열어 주고, 무엇이
 * 들어가는지 본 사람이 머지한다.
 */
export function InstallWorkflowRow({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const install = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setPrUrl(null);
    try {
      const r = await apiPost<{ already_installed: boolean; pull_request_url: string | null }>(
        `/projects/${projectId}/env-workflow`,
      );
      if (r.already_installed) {
        setResult('이미 들어가 있다. 바로 실행할 수 있다.');
      } else {
        setResult('PR을 열었다. 머지해야 실행이 된다.');
        setPrUrl(r.pull_request_url);
      }
    } catch (e: unknown) {
      setError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="po-listhead">
      <p className="meta">
        빌드는 연동한 레포의 GitHub Actions에서 돈다. 그러려면 그 레포에 워크플로 파일이 하나 있어야
        한다 — 아래 버튼이 PR로 넣어 준다(머지는 직접 하셔야 한다).
      </p>
      <Button onClick={install} disabled={busy}>
        {busy ? '넣는 중…' : '워크플로 설치'}
      </Button>
      {result !== null && (
        <p className="meta po-note">
          {result}
          {prUrl !== null && (
            <>
              {' '}
              <a href={prUrl} target="_blank" rel="noreferrer">
                PR 열기
              </a>
            </>
          )}
        </p>
      )}
      {error !== null && (
        <p className="meta po-note po-note--signal" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
