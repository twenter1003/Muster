import { useState } from 'react';
import { Button } from './Button';
import { apiFetch } from '../lib/api';
import { canDownload } from '../lib/documentEdit';
import { EM_DASH } from '../lib/domain';
import { errorMessage, type DocumentView } from './ProjectOverviewShared';
import { EditDocumentDialog } from './EditDocumentDialog';

/* ───────────────────────── 문서 행 동작 ─────────────────────────
 * 목록에 다운로드·수정·삭제를 붙인다. 세 동작 모두 성공하면 목록을 다시 부른다 —
 * 응답으로 화면의 행만 고치면 그 행만 최신이고 나머지는 아니게 되어, 어긋남이
 * 어디까지인지 화면 안에서 알 수 없다(예산 카드와 같은 판단).
 *
 * 판단이 갈린 곳: 수정은 모달, 삭제는 인라인 확인이다. 수정은 칸이 셋이라 행 안에 펼치면
 * 표가 흔들리고, 삭제는 되돌릴 수 없으니 "무엇이 사라지는지"를 그 행 옆에서 읽히게 해야
 * 한다(SettingsPage의 API 키 폐기와 같은 방식).
 */

/** `GET /documents/:id`가 목록 표현에 더해 주는 것. */
interface DocumentDetail extends DocumentView {
  download_url: string | null;
  download_expires_at: string | null;
}

export function DocumentTable({
  items,
  onChanged,
}: {
  items: DocumentView[];
  onChanged: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DocumentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (doc: DocumentView) => {
    setError(null);
    setBusyId(doc.id);
    try {
      // 누를 때마다 새로 발급받는다. signed URL은 download_expires_at에 만료되므로,
      // 목록을 그릴 때 미리 받아 두면 오래 열어 둔 화면의 링크가 조용히 죽는다.
      const detail = await apiFetch<DocumentDetail>(`/documents/${doc.id}`);
      if (detail.download_url === null) {
        setError('내려받을 파일이 없다 — 업로드가 끝나지 않은 문서다.');
        return;
      }
      // noopener: 열린 탭이 opener로 이 화면을 조작할 수 있으면 안 된다.
      window.open(detail.download_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    setBusyId(id);
    try {
      await apiFetch<void>(`/documents/${id}`, { method: 'DELETE' });
      setConfirmId(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <table className="table po-table">
        <thead>
          <tr>
            <th>제목</th>
            <th>타입</th>
            <th>업로드</th>
            <th>커밋</th>
            <th>동작</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id}>
              <td>{d.title}</td>
              <td>
                <span className="badge">{d.type}</span>
              </td>
              <td className="po-mono">{d.upload_status}</td>
              <td className="po-mono">{d.commit_ref ?? EM_DASH}</td>
              <td>
                {confirmId === d.id ? (
                  // 삭제는 되돌릴 수 없다. 한 번 더 묻되, 무엇이 사라지는지 문장으로 적는다.
                  <span className="po-actions">
                    <span className="po-actions__confirm">
                      파일과 메타데이터가 함께 사라진다. 되돌릴 수 없다.
                    </span>
                    <Button disabled={busyId !== null} onClick={() => void remove(d.id)}>
                      {busyId === d.id ? '삭제 중…' : '삭제한다'}
                    </Button>
                    <Button disabled={busyId !== null} onClick={() => setConfirmId(null)}>
                      취소
                    </Button>
                  </span>
                ) : (
                  <span className="po-actions">
                    {canDownload(d) ? (
                      <Button disabled={busyId !== null} onClick={() => void download(d)}>
                        {busyId === d.id ? '여는 중…' : '다운로드'}
                      </Button>
                    ) : (
                      // 업로드가 끝나지 않았으면 서버가 URL을 주지 않는다. 눌러 봐야 빈손인
                      // 버튼 대신 이유를 적는다 — upload_status 열이 바로 옆에 있다.
                      <span className="meta po-actions__note">업로드 미완료</span>
                    )}
                    <Button disabled={busyId !== null} onClick={() => setEditing(d)}>
                      수정
                    </Button>
                    <Button disabled={busyId !== null} onClick={() => setConfirmId(d.id)}>
                      삭제
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error !== null && (
        <p className="meta po-note po-note--signal" role="alert">
          {error}
        </p>
      )}

      {/* 열 때마다 새로 마운트한다 — 직전에 고치다 취소한 값이 남아 있으면 다음에 열었을 때
          화면이 서버와 다른 것을 보여 준다. */}
      {editing !== null && (
        <EditDocumentDialog
          document={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}
