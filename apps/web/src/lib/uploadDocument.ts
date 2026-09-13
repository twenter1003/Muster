import { apiPost } from './api';
import type { DocumentType } from './domain';

/** `POST /projects/:id/documents`가 돌려주는 것 중 업로드에 필요한 부분. */
export interface IssuedUpload {
  id: string;
  upload_url: string;
}

/**
 * 업로드에 필요한 파일의 성질만 추린 것. `File`을 그대로 받지 않는 이유는 DOM 없이도
 * 이 절차를 검증할 수 있어야 하기 때문이다 — 실제로 틀리기 쉬운 곳이 여기다.
 */
export interface UploadSource {
  name: string;
  /** 브라우저가 종류를 모르면 빈 문자열이다. */
  type: string;
}

export interface UploadDeps {
  issue: (body: {
    title: string;
    type: DocumentType;
    content_type: string;
  }) => Promise<IssuedUpload>;
  put: (url: string, contentType: string) => Promise<{ ok: boolean; status: number }>;
  complete: (documentId: string) => Promise<void>;
}

/**
 * 문서 업로드 세 단계: 발급 → GCS 직접 PUT → 완료 통보.
 *
 * 파일 바이트는 우리 서버를 지나지 않는다(설계서 Part 2 §4.1). Cloud Run의 요청 타임아웃
 * 60초와 메모리 파일시스템을 생각하면 이 경로 말고는 큰 파일을 다룰 방법이 없다.
 */
export async function uploadDocument(
  file: UploadSource,
  type: DocumentType,
  deps: UploadDeps,
): Promise<string> {
  // 브라우저가 종류를 모르면 빈 문자열을 준다. 그대로 보내면 서버의 MIME 형식 검증에 걸려
  // "업로드 실패"로 보이는데, 원인은 파일이 아니라 우리가 빈 값을 보낸 것이다.
  const contentType = file.type || 'application/octet-stream';

  const issued = await deps.issue({ title: file.name, type, content_type: contentType });

  // 서명에 content_type이 들어 있으므로 발급 때와 **같은 값**으로 올려야 한다. 다르면 GCS가
  // 서명 불일치로 거부한다.
  const put = await deps.put(issued.upload_url, contentType);
  if (!put.ok) {
    // 완료 통보를 하지 않는다. 문서는 pending으로 남아 목록에 그대로 보이고, 사용자가
    // 지우거나 다시 올릴 수 있다 — 올라가지 않은 파일을 completed로 적는 것이 최악이다.
    throw new Error(`저장소가 업로드를 거부했습니다 (HTTP ${put.status}).`);
  }

  await deps.complete(issued.id);
  return issued.id;
}

/**
 * 실제 API/네트워크에 붙인 기본 구현. 화면은 이것만 쓰면 된다.
 *
 * 보낼 바이트(`body`)를 여기서 닫아 둔다 — uploadDocument는 파일 내용을 모른 채 절차만
 * 진행하고, 그 덕에 DOM 없이 테스트된다.
 */
export function browserUploadDeps(projectId: string, body: Blob): UploadDeps {
  return {
    issue: (body) => apiPost<IssuedUpload>(`/projects/${projectId}/documents`, body),
    // apiFetch를 쓰지 않는다 — 그쪽은 우리 API 전용이라 경로에 /api/v1을 붙이고 JSON
    // 헤더를 강제한다. 여기서 보내는 것은 파일 바이트다.
    put: async (url, contentType) => {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body,
      });
      return { ok: res.ok, status: res.status };
    },
    complete: (documentId) => apiPost(`/documents/${documentId}/complete`),
  };
}
