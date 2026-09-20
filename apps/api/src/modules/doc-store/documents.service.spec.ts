import { Repository } from 'typeorm';
import { DocumentsService, objectPathOf } from './documents.service';
import type { ObjectStorage } from './object-storage';
import type { Document } from '../../database/entities';

/**
 * 업로드 3단계 플로우(설계서 Part 4 §4)의 결정들을 고정한다.
 * GCP 자격증명 없이 검증할 수 있도록 ObjectStorage는 fake를 쓴다.
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';
const DOC = '33333333-3333-4333-8333-333333333333';

class FakeStorage implements ObjectStorage {
  uploaded = new Set<string>();
  deleted: string[] = [];
  failUploadUrl = false;

  async createUploadUrl(p: { objectPath: string; contentType: string }) {
    if (this.failUploadUrl) throw new Error('signed URL 발급 실패');
    return {
      url: `https://gcs.test/${p.objectPath}?upload`,
      expiresAt: new Date(Date.now() + 1000),
    };
  }
  async createDownloadUrl(p: { objectPath: string }) {
    return { url: `https://gcs.test/${p.objectPath}?read`, expiresAt: new Date(Date.now() + 1000) };
  }
  async delete(objectPath: string) {
    this.deleted.push(objectPath);
    this.uploaded.delete(objectPath);
  }
  async exists(objectPath: string) {
    return this.uploaded.has(objectPath);
  }
}

const doc = (over: Partial<Document> = {}): Document =>
  ({
    id: DOC,
    project_id: PROJECT,
    title: '제목',
    type: 'prd',
    upload_status: 'pending',
    file_url: null,
    commit_ref: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }) as Document;

/** save/create/findOneBy/delete만 쓰는 얇은 대역. */
const makeRepos = (stored: Document | null) => {
  const saved: Document[] = [];
  const deletedIds: string[] = [];
  const documents = {
    create: (v: Partial<Document>) => ({ ...doc(), ...v }) as Document,
    save: async (v: Document) => {
      saved.push(v);
      return v;
    },
    findOneBy: async () => stored,
    delete: async (w: { id: string }) => {
      deletedIds.push(w.id);
      return { affected: 1 };
    },
  } as unknown as Repository<Document>;

  const members = { countBy: async () => 1 } as unknown as Repository<never>;
  return { documents, members, saved, deletedIds };
};

describe('DocumentsService', () => {
  describe('create — 메타데이터 + signed URL', () => {
    it('pending으로 만들고 업로드 URL을 함께 준다', async () => {
      const r = makeRepos(null);
      const storage = new FakeStorage();
      const service = new DocumentsService(r.documents, storage);

      const result = await service.create(PROJECT, {
        title: '제목',
        type: 'prd',
        content_type: 'text/markdown',
      });

      expect(result.document.upload_status).toBe('pending');
      expect(result.upload_url).toContain(objectPathOf(PROJECT, DOC));
    });

    it('URL 발급이 실패하면 빈 레코드를 남기지 않는다', async () => {
      const r = makeRepos(null);
      const storage = new FakeStorage();
      storage.failUploadUrl = true;
      const service = new DocumentsService(r.documents, storage);

      await expect(
        service.create(PROJECT, { title: '제목', type: 'prd', content_type: 'text/markdown' }),
      ).rejects.toThrow();

      expect(r.deletedIds).toContain(DOC);
    });
  });
});
