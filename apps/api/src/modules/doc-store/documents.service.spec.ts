import { Repository } from 'typeorm';
import { DocumentsService, objectPathOf } from './documents.service';
import type { ObjectStorage } from './object-storage';
import { ApiException } from '../../common/errors/api.exception';
import type { Document } from '../../database/entities';
import { AuditService } from '../audit/audit.service';

/**
 * 업로드 3단계 플로우(설계서 Part 4 §4)의 결정들을 고정한다.
 * GCP 자격증명 없이 검증할 수 있도록 ObjectStorage는 fake를 쓴다.
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
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
      const service = new DocumentsService(r.documents, r.members as never, storage, {
        record: async () => undefined,
      } as unknown as AuditService);

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
      const service = new DocumentsService(r.documents, r.members as never, storage, {
        record: async () => undefined,
      } as unknown as AuditService);

      await expect(
        service.create(PROJECT, { title: '제목', type: 'prd', content_type: 'text/markdown' }),
      ).rejects.toThrow();

      expect(r.deletedIds).toContain(DOC);
    });
  });

  describe('complete — 업로드 완료 확인', () => {
    it('객체가 실제로 없으면 completed로 넘기지 않는다', async () => {
      const stored = doc({ file_url: objectPathOf(PROJECT, DOC) });
      const r = makeRepos(stored);
      const service = new DocumentsService(r.documents, r.members as never, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      await expect(service.complete(DOC, USER)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(stored.upload_status).toBe('pending');
    });

    it('객체가 있으면 completed로 전이한다', async () => {
      const path = objectPathOf(PROJECT, DOC);
      const stored = doc({ file_url: path });
      const r = makeRepos(stored);
      const storage = new FakeStorage();
      storage.uploaded.add(path);
      const service = new DocumentsService(r.documents, r.members as never, storage, {
        record: async () => undefined,
      } as unknown as AuditService);

      const result = await service.complete(DOC, USER);
      expect(result.upload_status).toBe('completed');
    });

    it('이미 completed면 그대로 돌려준다 (재호출이 실패가 아니다)', async () => {
      const stored = doc({ upload_status: 'completed', file_url: objectPathOf(PROJECT, DOC) });
      const r = makeRepos(stored);
      // 저장소를 건드리지 않아야 한다 — exists를 부르면 fake가 false를 줘서 실패했을 것이다.
      const service = new DocumentsService(r.documents, r.members as never, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      await expect(service.complete(DOC, USER)).resolves.toMatchObject({
        upload_status: 'completed',
      });
    });
  });

  describe('detail — 조회 URL', () => {
    it('pending 문서도 돌려주되 다운로드 URL은 없다 (DRIFT 5)', async () => {
      const r = makeRepos(doc({ file_url: objectPathOf(PROJECT, DOC) }));
      const service = new DocumentsService(r.documents, r.members as never, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      const result = await service.detail(DOC, USER);
      expect(result.document.upload_status).toBe('pending');
      expect(result.download_url).toBeNull();
    });

    it('completed 문서에는 조회용 signed URL을 준다', async () => {
      const path = objectPathOf(PROJECT, DOC);
      const r = makeRepos(doc({ upload_status: 'completed', file_url: path }));
      const service = new DocumentsService(r.documents, r.members as never, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      const result = await service.detail(DOC, USER);
      expect(result.download_url).toContain(path);
    });
  });

  describe('remove — 삭제', () => {
    it('GCS 객체를 지운 뒤 레코드를 지운다', async () => {
      const path = objectPathOf(PROJECT, DOC);
      const r = makeRepos(doc({ upload_status: 'completed', file_url: path }));
      const storage = new FakeStorage();
      storage.uploaded.add(path);
      const service = new DocumentsService(r.documents, r.members as never, storage, {
        record: async () => undefined,
      } as unknown as AuditService);

      await service.remove(DOC, USER);
      expect(storage.deleted).toContain(path);
      expect(r.deletedIds).toContain(DOC);
    });

    it('객체가 없어도 삭제는 성공한다 — 그렇지 않으면 레코드를 영영 못 지운다', async () => {
      const r = makeRepos(doc({ file_url: objectPathOf(PROJECT, DOC) }));
      const service = new DocumentsService(r.documents, r.members as never, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      await expect(service.remove(DOC, USER)).resolves.toBeUndefined();
      expect(r.deletedIds).toContain(DOC);
    });
  });

  describe('접근 제어', () => {
    it('없는 문서는 404다', async () => {
      const r = makeRepos(null);
      const service = new DocumentsService(r.documents, r.members as never, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      await expect(service.detail(DOC, USER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('비멤버에게는 403이 아니라 404를 준다 — 존재 여부를 알려주지 않는다', async () => {
      const r = makeRepos(doc());
      const members = { countBy: async () => 0 } as unknown as Repository<never>;
      const service = new DocumentsService(r.documents, members, new FakeStorage(), {
        record: async () => undefined,
      } as unknown as AuditService);

      try {
        await service.detail(DOC, USER);
        throw new Error('던졌어야 합니다');
      } catch (e) {
        expect((e as ApiException).getStatus()).toBe(404);
      }
    });
  });
});
