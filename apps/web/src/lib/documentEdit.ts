import type { DocumentType } from './domain';

/** 수정 폼이 다루는 문서의 현재 값. 화면의 DocumentView 중 폼이 건드리는 세 칸만 본다. */
export interface EditableDocument {
  title: string;
  type: string;
  commit_ref: string | null;
}

/** 폼 입력은 전부 문자열이다 — 비어 있음("")과 null의 구분은 아래에서 한 번만 내린다. */
export interface DocumentForm {
  title: string;
  type: DocumentType;
  commitRef: string;
}

export interface DocumentPatch {
  title?: string;
  type?: DocumentType;
  commit_ref?: string | null;
}

export type PatchResult = { ok: true; body: DocumentPatch } | { ok: false; reason: string };

export const DOCUMENT_TITLE_MAX = 300;

/** 서버 UpdateDocumentDto와 같은 규칙(7~40자 16진수). 어긋나면 400이 나므로 여기서 먼저 막는다. */
const COMMIT_REF = /^[0-9a-f]{7,40}$/i;

/**
 * 폼 입력 → PATCH 본문.
 *
 * 판단이 셋 들어 있어 화면에서 떼어 냈다. DOM 없이 검증할 수 있는 곳에 두는 편이,
 * 이 규칙들이 조용히 어긋나는 것보다 낫다.
 *
 * 1. 바뀐 칸만 싣는다. PATCH는 부분 수정이고, 안 바뀐 값을 같이 보내면 그 사이 남이 고친
 *    것을 덮어쓴다(EditProjectDialog와 같은 이유).
 * 2. 커밋 칸을 비우면 `commit_ref: null`을 **명시해서** 보낸다. 빼면 "안 고침"이 되어
 *    연결이 그대로 남는다 — 사용자는 지웠다고 믿는데 서버는 그대로인 상태가 최악이다.
 * 3. 형식 위반은 요청 전에 잡는다. 서버 400을 받아 보여 줘도 되지만, 그때는 이미
 *    "저장 실패"로 읽히고 어느 칸이 틀렸는지 사용자가 되짚어야 한다.
 */
export function buildDocumentPatch(current: EditableDocument, form: DocumentForm): PatchResult {
  const title = form.title.trim();
  if (title.length === 0 || title.length > DOCUMENT_TITLE_MAX) {
    return { ok: false, reason: `제목은 1~${DOCUMENT_TITLE_MAX}자여야 한다.` };
  }

  const commitRef = form.commitRef.trim();
  if (commitRef.length > 0 && !COMMIT_REF.test(commitRef)) {
    return { ok: false, reason: '커밋 해시는 7~40자 16진수여야 한다.' };
  }

  const body: DocumentPatch = {};
  if (title !== current.title) body.title = title;
  if (form.type !== current.type) body.type = form.type;

  const nextCommit = commitRef.length === 0 ? null : commitRef;
  if (nextCommit !== current.commit_ref) body.commit_ref = nextCommit;

  if (Object.keys(body).length === 0) return { ok: false, reason: '바뀐 것이 없다.' };
  return { ok: true, body };
}

/**
 * 다운로드를 걸어 줄 수 있는지. 업로드가 끝나지 않은 문서는 GCS에 객체가 없어 서버가
 * download_url을 null로 준다 — 버튼을 눌러 봐야 빈손이므로 애초에 주지 않고 이유를 적는다.
 */
export function canDownload(doc: { upload_status: string }): boolean {
  return doc.upload_status === 'completed';
}
