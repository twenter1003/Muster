import { useRef, useState } from 'react';
import { Button } from './Button';
import { ApiError } from '../lib/api';
import { browserUploadDeps, uploadDocument } from '../lib/uploadDocument';
import { DOCUMENT_TYPES, type DocumentType } from '../lib/domain';

/* ───────────────────────── 문서 업로드 ─────────────────────────
 * 절차(발급 → GCS 직접 PUT → 완료 통보)와 그 판단은 lib/uploadDocument.ts에 있다.
 * 여기 남는 것은 화면 상태뿐이다 — 파일 선택, 진행 문구, 실패 표시.
 *
 * 중간에 끊기면 문서는 pending으로 남고 목록에 그대로 보인다(DESIGN_DRIFT.md 5번).
 * 사용자가 지우거나 다시 올릴 수 있으므로, 화면이 실패를 감추지 않는 것이 중요하다.
 */
export function DocumentUpload({
  projectId,
  onUploaded,
}: {
  projectId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocumentType>('other');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setError(null);

    try {
      setBusy('올리는 중');
      await uploadDocument(file, type, browserUploadDeps(projectId, file));

      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (e) {
      // 실패는 반드시 화면에 남긴다. 콘솔에만 남기면 사용자는 "왜 목록에 없지"만 본다.
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="po-upload">
      <input
        ref={inputRef}
        type="file"
        aria-label="업로드할 파일"
        disabled={busy !== null}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError(null);
        }}
      />
      <select
        aria-label="문서 종류"
        value={type}
        disabled={busy !== null}
        onChange={(e) => setType(e.target.value as DocumentType)}
      >
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <Button variant="solid" onClick={upload} disabled={!file || busy !== null}>
        {busy ?? '업로드'}
      </Button>
      {/* 실패는 반드시 화면에 남긴다. 콘솔에만 남기면 사용자는 "왜 목록에 없지"만 본다. */}
      {error && (
        <p className="meta po-note po-note--signal" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
