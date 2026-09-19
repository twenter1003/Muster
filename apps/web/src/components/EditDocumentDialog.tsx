import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { apiPatch } from '../lib/api';
import { DOCUMENT_TITLE_MAX, buildDocumentPatch } from '../lib/documentEdit';
import { DOCUMENT_TYPES, type DocumentType } from '../lib/domain';
import { asDocumentType, errorMessage, type DocumentView } from './ProjectOverviewShared';

export function EditDocumentDialog({
  document: doc,
  onClose,
  onSaved,
}: {
  document: DocumentView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [type, setType] = useState<DocumentType>(asDocumentType(doc.type));
  const [commitRef, setCommitRef] = useState(doc.commit_ref ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = buildDocumentPatch(doc, { title, type, commitRef });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patch.ok || saving) return;

    setSaving(true);
    setError(null);
    apiPatch<DocumentView>(`/documents/${doc.id}`, patch.body).then(onSaved, (err: unknown) => {
      setSaving(false);
      setError(errorMessage(err));
    });
  };

  return (
    <Modal open title="문서 수정" onClose={saving ? () => undefined : onClose}>
      <form className="modal__form" onSubmit={submit}>
        <div className="field">
          <label className="meta" htmlFor="edit-doc-title">
            제목
          </label>
          <input
            id="edit-doc-title"
            className="input modal__input"
            value={title}
            maxLength={DOCUMENT_TITLE_MAX}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="meta" htmlFor="edit-doc-type">
            종류
          </label>
          <select
            id="edit-doc-type"
            className="input modal__input"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="meta" htmlFor="edit-doc-commit">
            커밋
          </label>
          <input
            id="edit-doc-commit"
            className="input modal__input"
            value={commitRef}
            placeholder="7~40자 16진수"
            onChange={(e) => setCommitRef(e.target.value)}
          />
          <span className="meta">비우면 커밋 연결이 끊깁니다.</span>
        </div>

        {/* 형식 위반은 저장을 누르기 전에 알려 준다. 서버 400을 기다리면 "저장 실패"로만
            읽혀 어느 칸이 틀렸는지 되짚어야 한다. */}
        {!patch.ok && patch.reason !== '바뀐 것이 없다.' && (
          <p className="error-note" role="alert">
            {patch.reason}
          </p>
        )}
        {error !== null && (
          <p className="error-note" role="alert">
            저장하지 못했다: {error}
          </p>
        )}

        <div className="modal__actions">
          <Button type="button" onClick={onClose} disabled={saving}>
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
