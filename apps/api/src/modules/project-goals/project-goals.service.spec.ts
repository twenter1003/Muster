import { Repository } from 'typeorm';
import { ProjectGoalsService } from './project-goals.service';
import { ApiException } from '../../common/errors/api.exception';
import type { ProjectGoals } from '../../database/entities';
import type { GeminiClient, GeminiGenerateParams } from '../../common/llm/gemini-client';
import type { GitIntegrationService } from '../project-core/git-integration.service';
import type { AuditService } from '../audit/audit.service';
import type { RepoDoc } from '../project-core/github-repo.client';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

class FakeGemini implements GeminiClient {
  lastParams: GeminiGenerateParams | null = null;
  response = '';

  async generate(params: GeminiGenerateParams): Promise<string> {
    this.lastParams = params;
    return this.response;
  }
}

const make = (opts: { goalsRow?: ProjectGoals | null; docs?: RepoDoc[] }) => {
  const saved: Record<string, unknown>[] = [];

  const goals = {
    findOneBy: async () => opts.goalsRow ?? null,
    create: (v: Partial<ProjectGoals>) => v as ProjectGoals,
    merge: (row: ProjectGoals, v: Partial<ProjectGoals>) => ({ ...row, ...v }) as ProjectGoals,
    save: async (v: ProjectGoals) => {
      const row = { ...v, updated_at: v.updated_at ?? new Date('2026-01-01T00:00:00Z') };
      saved.push(row);
      return row as ProjectGoals;
    },
  } as unknown as Repository<ProjectGoals>;

  const gemini = new FakeGemini();

  const auditCalls: unknown[] = [];
  const audit = {
    record: async (entry: unknown) => {
      auditCalls.push(entry);
    },
  } as unknown as AuditService;

  const gitIntegration = {
    repoDocs: async () => opts.docs ?? [],
  } as unknown as GitIntegrationService;

  const service = new ProjectGoalsService(goals, gemini, gitIntegration, audit);
  return { service, gemini, saved, auditCalls };
};

describe('ProjectGoalsService', () => {
  describe('getGoals / saveGoals', () => {
    it('확정된 목표가 없으면 content_md가 null이다', async () => {
      const { service } = make({ goalsRow: null });
      await expect(service.getGoals(PROJECT)).resolves.toEqual({
        content_md: null,
        updated_at: null,
      });
    });

    it('저장하면 감사 로그를 남기고 저장된 값을 돌려준다', async () => {
      const { service, auditCalls } = make({ goalsRow: null });
      const result = await service.saveGoals(PROJECT, USER, '# 목표');

      expect(result.content_md).toBe('# 목표');
      expect(auditCalls).toEqual([
        { user_id: USER, action: 'project_goals.update', project_id: PROJECT },
      ]);
    });
  });

  describe('draftGoals', () => {
    it('레포 문서가 없으면 404다', async () => {
      const { service } = make({ docs: [] });
      await expect(service.draftGoals(PROJECT, USER)).rejects.toThrow(ApiException);
    });

    it('문서를 프롬프트에 이어붙여 Gemini를 부르고, 저장 없이 초안만 돌려준다', async () => {
      const { service, gemini, saved } = make({
        docs: [
          { path: 'README.md', content: '# 프로젝트' },
          { path: 'docs/a.md', content: '문서 내용' },
        ],
      });
      gemini.response = '## 목표\n- [ ] 생성된 초안';

      const result = await service.draftGoals(PROJECT, USER);

      expect(gemini.lastParams?.prompt).toContain('README.md');
      expect(gemini.lastParams?.prompt).toContain('문서 내용');
      expect(result).toEqual({
        content_md: '## 목표\n- [ ] 생성된 초안',
        source_paths: ['README.md', 'docs/a.md'],
      });
      expect(saved).toHaveLength(0); // 저장하지 않는다
    });
  });
});
