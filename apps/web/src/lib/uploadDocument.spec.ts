import { describe, expect, it } from 'vitest';
import { uploadDocument, type UploadDeps } from './uploadDocument';

/** 호출을 기록하는 대역. 세 단계가 실제로 어떤 순서로, 무엇을 들고 불리는지 본다. */
const make = (over: Partial<{ putOk: boolean; putStatus: number }> = {}) => {
  const calls: string[] = [];
  let issued: { title: string; type: string; content_type: string } | null = null;
  let putContentType: string | null = null;

  const deps: UploadDeps = {
    issue: async (body) => {
      calls.push('issue');
      issued = body;
      return { id: 'doc-1', upload_url: 'https://storage.example/signed' };
    },
    put: async (_url, contentType) => {
      calls.push('put');
      putContentType = contentType;
      return { ok: over.putOk ?? true, status: over.putStatus ?? 200 };
    },
    complete: async () => {
      calls.push('complete');
    },
  };

  return { deps, calls, issued: () => issued, putContentType: () => putContentType };
};

describe('uploadDocument', () => {
  it('발급 → 업로드 → 완료 순서로 진행한다', async () => {
    const t = make();
    await expect(
      uploadDocument({ name: 'a.pdf', type: 'application/pdf' }, 'prd', t.deps),
    ).resolves.toBe('doc-1');

    expect(t.calls).toEqual(['issue', 'put', 'complete']);
    expect(t.issued()).toEqual({ title: 'a.pdf', type: 'prd', content_type: 'application/pdf' });
  });

  it('발급 때와 같은 content_type으로 올린다', async () => {
    // 서명에 content_type이 들어 있어, 다르면 GCS가 서명 불일치로 거부한다.
    const t = make();
    await uploadDocument({ name: 'a.pdf', type: 'application/pdf' }, 'other', t.deps);

    expect(t.putContentType()).toBe('application/pdf');
  });

  it('브라우저가 종류를 모르면 octet-stream으로 채운다', async () => {
    // 빈 문자열을 그대로 보내면 서버의 MIME 형식 검증에 걸려 원인이 엉뚱해 보인다.
    const t = make();
    await uploadDocument({ name: 'unknown.bin', type: '' }, 'other', t.deps);

    expect(t.issued()?.content_type).toBe('application/octet-stream');
    expect(t.putContentType()).toBe('application/octet-stream');
  });

  it('업로드가 거부되면 완료 통보를 하지 않는다', async () => {
    // 올라가지 않은 파일을 completed로 적는 것이 최악이다. pending으로 남겨야 사용자가
    // 지우거나 다시 올릴 수 있다.
    const t = make({ putOk: false, putStatus: 403 });

    await expect(
      uploadDocument({ name: 'a.txt', type: 'text/plain' }, 'other', t.deps),
    ).rejects.toThrow('HTTP 403');
    expect(t.calls).toEqual(['issue', 'put']);
  });
});
