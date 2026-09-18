import { Repository } from 'typeorm';
import { ProjectGoalsService, parseProgress } from './project-goals.service';
import { ApiException } from '../../common/errors/api.exception';
import type {
  ProjectGoals,
  ProjectMember,
  ProjectProgressSnapshot,
} from '../../database/entities';
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
  membersRow?: Partial<ProjectMember> | null;
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
    update: async (_criteria: unknown, partial: Partial<ProjectGoals>) => {
      if (opts.goalsRow) {
        Object.assign(opts.goalsRow, partial);
      }
      return { affected: 1 };
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

  const members = {
    findOne: async () =>
      opts.membersRow !== undefined
        ? opts.membersRow
        : { user_id: USER, role: 'owner' as const },
  } as unknown as Repository<ProjectMember>;

  const service = new ProjectGoalsService(goals, snapshots, gemini, gitIntegration, audit, members);
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

    it('이미 모든 항목이 완료되어 있으면 Gemini 호출 없이 100%를 반환한다', async () => {
      const goalsRow = {
        id: 'g1',
        project_id: PROJECT,
        content_md: '## 목표\n- [x] 로그인\n- [x] 결제',
        updated_at: new Date('2026-01-01T00:00:00Z'),
      } as ProjectGoals;

      const { service, gemini, saved } = make({
        goalsRow,
        commits: [{ sha: 'abc1234', message: 'chore: update', authored_at: null, url: '' }],
      });

      const result = await service.analyzeProgress(PROJECT, USER);

      expect(gemini.lastParams).toBeNull(); // LLM 호출 건너뜀 (비용/지연 절약)
      expect(result.percent).toBe(100);
      expect(result.remaining_items).toEqual([]);
      expect(saved).toHaveLength(1);
    });

    it('커밋 이력이 없으면 기존 체크된 비율로 결정론적 진행률을 산출한다', async () => {
      const goalsRow = {
        id: 'g1',
        project_id: PROJECT,
        content_md: '## 목표\n- [x] 로그인\n- [ ] 결제\n- [ ] 정산',
        updated_at: new Date('2026-01-01T00:00:00Z'),
      } as ProjectGoals;

      const { service, gemini } = make({ goalsRow, commits: [] });

      const result = await service.analyzeProgress(PROJECT, USER);

      expect(gemini.lastParams).toBeNull();
      // 1 / 3 = 33%
      expect(result.percent).toBe(33);
      expect(result.remaining_items).toHaveLength(2);
      expect(result.summary).toContain('연동된 커밋 이력이 없어');
    });

    it('커밋과 미완료 항목을 Gemini에 넘겨 검증하고, 검증된 항목을 [x]로 업데이트하여 결정론적 퍼센트를 산출한다', async () => {
      const goalsRow = {
        id: 'g1',
        project_id: PROJECT,
        content_md: '## 목표\n- [ ] 로그인 기능\n- [ ] 결제 기능',
        updated_at: new Date('2026-01-01T00:00:00Z'),
      } as ProjectGoals;

      const { service, gemini, auditCalls } = make({
        goalsRow,
        commits: [{ sha: 'abc1234567', message: 'feat: 로그인 구현', authored_at: null, url: '' }],
      });

      // index 0(로그인 기능) 달성 응답
      gemini.response = JSON.stringify({
        completed_items: [
          { index: 0, commit_sha: 'abc1234567', reason: '로그인 커밋으로 기능 완료' },
        ],
        summary: '로그인 기능이 구현되었습니다. 결제 기능이 남아있습니다.',
      });

      const result = await service.analyzeProgress(PROJECT, USER);

      expect(gemini.lastParams?.prompt).toContain('로그인 기능');
      expect(gemini.lastParams?.prompt).toContain('로그인 구현');
      expect(gemini.lastParams?.responseSchema).toBeDefined();

      // 2개 중 1개 완료 -> 정확히 50%
      expect(result.percent).toBe(50);
      expect(result.based_on_commit_sha).toBe('abc1234567');
      expect(result.remaining_items).toHaveLength(1);
      expect(result.remaining_items[0].title).toBe('결제 기능');

      // goalsRow의 content_md가 - [x] 로그인 기능으로 갱신되었는지 확인
      expect(goalsRow.content_md).toBe('## 목표\n- [x] 로그인 기능\n- [ ] 결제 기능');

      expect(auditCalls).toEqual([
        { user_id: USER, action: 'project_progress.analyze', project_id: PROJECT },
      ]);
    });
  });

  describe('handleCodePushed (자동 갱신 훅 및 10분 쿨다운)', () => {
    it('푸시 이벤트 수신 시 자동으로 analyzeProgress를 트리거하고 쿨다운을 기록한다', async () => {
      const goalsRow = {
        id: 'g1',
        project_id: PROJECT,
        content_md: '## 목표\n- [x] 기존 완료',
        updated_at: new Date(),
      } as ProjectGoals;

      const { service, auditCalls } = make({ goalsRow });
      await service.handleCodePushed({
        project_id: PROJECT,
        ref: 'refs/heads/main',
        occurred_at: new Date().toISOString(),
        repo_url: 'https://github.com/kimtaewoo/muster',
        commits_count: 1,
      });

      expect(service.lastAutoAnalysisMap.has(PROJECT)).toBe(true);
      expect(auditCalls).toEqual([
        { user_id: USER, action: 'project_progress.analyze', project_id: PROJECT },
      ]);
    });

    it('10분 쿨다운 이내에 다시 푸시되면 자동 분석을 건너뛴다', async () => {
      const goalsRow = {
        id: 'g1',
        project_id: PROJECT,
        content_md: '## 목표\n- [x] 기존 완료',
        updated_at: new Date(),
      } as ProjectGoals;

      const { service, auditCalls } = make({ goalsRow });

      // 1회차 실행
      await service.handleCodePushed({
        project_id: PROJECT,
        ref: 'refs/heads/main',
        occurred_at: new Date().toISOString(),
        repo_url: 'https://github.com/kimtaewoo/muster',
        commits_count: 1,
      });
      expect(auditCalls).toHaveLength(1);

      // 즉시 2회차 실행 (쿨다운 상태)
      await service.handleCodePushed({
        project_id: PROJECT,
        ref: 'refs/heads/main',
        occurred_at: new Date().toISOString(),
        repo_url: 'https://github.com/kimtaewoo/muster',
        commits_count: 2,
      });
      // 호출 횟수가 늘어나지 않음
      expect(auditCalls).toHaveLength(1);
    });

    it('목표 문서가 없는 프로젝트는 쿨다운을 소모하지 않고 건너뛴다', async () => {
      const { service } = make({ goalsRow: null });
      await service.handleCodePushed({
        project_id: PROJECT,
        ref: 'refs/heads/main',
        occurred_at: new Date().toISOString(),
        repo_url: 'https://github.com/kimtaewoo/muster',
        commits_count: 1,
      });

      expect(service.lastAutoAnalysisMap.has(PROJECT)).toBe(false);
    });
  });
});

describe('parseProgress', () => {
  it('JSON이 아니면 502를 던진다', () => {
    expect(() => parseProgress('not json')).toThrow(ApiException);
  });

  it('summary가 없으면 502를 던진다', () => {
    expect(() => parseProgress(JSON.stringify({ completed_items: [] }))).toThrow(ApiException);
  });

  it('completed_items 및 legacy percent 모두 없으면 502를 던진다', () => {
    expect(() => parseProgress(JSON.stringify({ summary: '요약만 있음' }))).toThrow(ApiException);
  });

  it('신규 completed_items 스키마를 올바르게 파싱한다', () => {
    const result = parseProgress(
      JSON.stringify({
        completed_items: [
          { index: 1, commit_sha: 'abc1234', reason: '완료 근거' },
          { index: -1, commit_sha: '음수인덱스제외' },
        ],
        summary: '요약',
      }),
    );
    expect(result.completed_items).toEqual([
      { index: 1, commit_sha: 'abc1234', reason: '완료 근거' },
    ]);
    expect(result.summary).toBe('요약');
  });

  it('레거시 percent 및 remaining_items 스키마도 하위 호환 파싱한다', () => {
    const result = parseProgress(
      JSON.stringify({
        percent: 75,
        summary: '레거시 요약',
        remaining_items: [{ title: '남은 작업', description: '설명' }],
      }),
    );
    expect(result.legacy_percent).toBe(75);
    expect(result.summary).toBe('레거시 요약');
    expect(result.legacy_remaining_items).toEqual([{ title: '남은 작업', description: '설명' }]);
  });
});
