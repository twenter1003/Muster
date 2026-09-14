import { Repository } from 'typeorm';
import { ProjectGoalsService, parseProgress } from './project-goals.service';
import { ApiException } from '../../common/errors/api.exception';
import type { ProjectGoals, ProjectProgressSnapshot } from '../../database/entities';
import type { GeminiClient, GeminiGenerateParams } from '../../common/llm/gemini-client';
import type { GitIntegrationService } from '../project-core/git-integration.service';
import type { AuditService } from '../audit/audit.service';
import type { CommitSummary, RepoDoc } from '../project-core/github-repo.client';

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

const make = (opts: {
  goalsRow?: ProjectGoals | null;
  snapshotRow?: ProjectProgressSnapshot | null;
  docs?: RepoDoc[];
  commits?: CommitSummary[];
}) => {
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

  const snapshots = {
    findOne: async () => opts.snapshotRow ?? null,
    create: (v: Partial<ProjectProgressSnapshot>) => v as ProjectProgressSnapshot,
    save: async (v: ProjectProgressSnapshot) => {
      const row = { ...v, id: 's1', analyzed_at: new Date('2026-01-02T00:00:00Z') };
      saved.push(row);
      return row as ProjectProgressSnapshot;
    },
  } as unknown as Repository<ProjectProgressSnapshot>;

  const gemini = new FakeGemini();

  const auditCalls: unknown[] = [];
  const audit = {
    record: async (entry: unknown) => {
      auditCalls.push(entry);
    },
  } as unknown as AuditService;

  const gitIntegration = {
    repoDocs: async () => opts.docs ?? [],
    recentCommits: async () => opts.commits ?? [],
  } as unknown as GitIntegrationService;

  const service = new ProjectGoalsService(goals, snapshots, gemini, gitIntegration, audit);
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
      gemini.response = '## 목표\n생성된 초안';

      const result = await service.draftGoals(PROJECT, USER);

      expect(gemini.lastParams?.prompt).toContain('README.md');
      expect(gemini.lastParams?.prompt).toContain('문서 내용');
      expect(result).toEqual({
        content_md: '## 목표\n생성된 초안',
        source_paths: ['README.md', 'docs/a.md'],
      });
      expect(saved).toHaveLength(0); // 저장하지 않는다
    });
  });

  describe('analyzeProgress', () => {
    it('확정된 목표가 없으면 409다', async () => {
      const { service } = make({ goalsRow: null });
      try {
        await service.analyzeProgress(PROJECT, USER);
        throw new Error('던졌어야 합니다');
      } catch (e) {
        expect((e as ApiException).getStatus()).toBe(409);
      }
    });

    it('확정된 목표와 커밋 이력을 Gemini에 넘겨 스냅샷을 만든다', async () => {
      const goalsRow = {
        id: 'g1',
        project_id: PROJECT,
        content_md: '## 목표\n로그인 기능',
        updated_at: new Date('2026-01-01T00:00:00Z'),
      } as ProjectGoals;

      const { service, gemini, auditCalls } = make({
        goalsRow,
        commits: [{ sha: 'abc1234567', message: '로그인 구현', authored_at: null, url: '' }],
      });
      gemini.response = JSON.stringify({
        percent: 40,
        summary: '로그인은 됐고 나머지는 안 됐다.',
        remaining_items: [{ title: '회원가입', description: '커밋에 없음' }],
      });

      const result = await service.analyzeProgress(PROJECT, USER);

      expect(gemini.lastParams?.prompt).toContain('로그인 기능');
      expect(gemini.lastParams?.prompt).toContain('로그인 구현');
      expect(gemini.lastParams?.responseSchema).toBeDefined();
      expect(result.percent).toBe(40);
      expect(result.based_on_commit_sha).toBe('abc1234567');
      expect(auditCalls).toEqual([
        { user_id: USER, action: 'project_progress.analyze', project_id: PROJECT },
      ]);
    });
  });
});

describe('parseProgress', () => {
  it('JSON이 아니면 502를 던진다', () => {
    expect(() => parseProgress('not json')).toThrow(ApiException);
  });

  it('percent가 없으면 502를 던진다', () => {
    expect(() => parseProgress(JSON.stringify({ summary: 's', remaining_items: [] }))).toThrow(
      ApiException,
    );
  });

  it('percent를 0~100으로 자른다', () => {
    const over = parseProgress(JSON.stringify({ percent: 150, summary: 's', remaining_items: [] }));
    expect(over.percent).toBe(100);

    const under = parseProgress(
      JSON.stringify({ percent: -20, summary: 's', remaining_items: [] }),
    );
    expect(under.percent).toBe(0);
  });

  it('title이 빈 remaining_items 항목은 버린다', () => {
    const result = parseProgress(
      JSON.stringify({
        percent: 50,
        summary: 's',
        remaining_items: [
          { title: '', description: '빈 제목' },
          { title: '유효', description: '설명' },
        ],
      }),
    );
    expect(result.remaining_items).toEqual([{ title: '유효', description: '설명' }]);
  });
});
