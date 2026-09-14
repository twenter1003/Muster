import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { ProjectGoals, ProjectProgressSnapshot, type RemainingItem } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GEMINI_CLIENT, type GeminiClient } from '../../common/llm/gemini-client';
import { GitIntegrationService } from '../project-core/git-integration.service';
import { AuditService } from '../audit/audit.service';

export interface GoalsView {
  content_md: string | null;
  updated_at: string | null;
}

export interface DraftGoalsResult {
  content_md: string;
  source_paths: string[];
}

export interface ProgressView {
  percent: number;
  summary: string;
  remaining_items: RemainingItem[];
  based_on_commit_sha: string | null;
  analyzed_at: string;
}

const DRAFT_SYSTEM_INSTRUCTION = `당신은 소프트웨어 프로젝트의 README와 문서를 읽고 목표/요구사항 문서 초안을 쓴다.

규칙:
- 마크다운으로 쓴다. 제목(##)으로 섹션을 나눈다.
- "이 프로젝트가 무엇을 하는가"와 "무엇을 구현해야 하는가(주요 기능 목록)"를 반드시 포함한다.
- 문서에 없는 내용을 지어내지 않는다. 추측이면 "추정:"을 붙인다.
- 사람이 검토·수정한다는 것을 전제로, 확신이 없는 부분은 짧게 남긴다.`;

const ANALYZE_SYSTEM_INSTRUCTION = `당신은 확정된 목표/요구사항 문서와 최근 커밋 이력을 대조해 프로젝트 진행률을 추정한다.

규칙:
- percent는 0~100 정수. 목표 대비 얼마나 구현됐는지 추정치다 — 커밋 개수가 아니라 목표 항목이
  실제로 구현된 것으로 보이는지를 근거로 판단한다.
- summary는 한국어 2~4문장으로, 무엇이 됐고 무엇이 안 됐는지 요약한다.
- remaining_items는 목표에는 있지만 커밋 이력에서 구현된 흔적을 찾지 못한 항목들이다.
  각 항목은 title(짧게)과 description(왜 그렇게 판단했는지)을 담는다.
- 확신이 없으면 percent를 보수적으로 낮게 잡는다. 과대평가보다 과소평가가 안전하다.`;

const PROGRESS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    percent: { type: 'integer' },
    summary: { type: 'string' },
    remaining_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      },
    },
  },
  required: ['percent', 'summary', 'remaining_items'],
} as const;

@Injectable()
export class ProjectGoalsService {
  constructor(
    @InjectRepository(ProjectGoals) private readonly goals: Repository<ProjectGoals>,
    @InjectRepository(ProjectProgressSnapshot)
    private readonly snapshots: Repository<ProjectProgressSnapshot>,
    @Inject(GEMINI_CLIENT) private readonly gemini: GeminiClient,
    private readonly gitIntegration: GitIntegrationService,
    private readonly audit: AuditService,
  ) {}

  async getGoals(projectId: string): Promise<GoalsView> {
    const row = await this.goals.findOneBy({ project_id: projectId });
    return {
      content_md: row?.content_md ?? null,
      updated_at: row ? row.updated_at.toISOString() : null,
    };
  }

  async saveGoals(projectId: string, userId: string, contentMd: string): Promise<GoalsView> {
    let row = await this.goals.findOneBy({ project_id: projectId });
    row = row
      ? this.goals.merge(row, { content_md: contentMd })
      : this.goals.create({ project_id: projectId, content_md: contentMd });

    const saved = await this.goals.save(row);
    await this.audit.record({
      user_id: userId,
      action: 'project_goals.update',
      project_id: projectId,
    });

    return { content_md: saved.content_md, updated_at: saved.updated_at.toISOString() };
  }

  /**
   * 레포 문서(README + docs/)로 초안을 만든다. **저장하지 않는다** — 응답을 그대로
   * 편집창에 채우고, 사용자가 "저장"을 눌러야만 `saveGoals`가 반영한다.
   */
  async draftGoals(projectId: string, userId: string): Promise<DraftGoalsResult> {
    const docs = await this.gitIntegration.repoDocs(projectId, userId);
    if (docs.length === 0) {
      throw ApiException.notFound(
        '레포에서 README나 문서를 찾지 못했습니다. 레포가 연동돼 있는지 확인하거나, 직접 입력해 주세요.',
      );
    }

    const prompt = docs.map((doc) => `### ${doc.path}\n\n${doc.content}`).join('\n\n---\n\n');

    const contentMd = await this.gemini.generate({
      systemInstruction: DRAFT_SYSTEM_INSTRUCTION,
      prompt,
    });

    return { content_md: contentMd, source_paths: docs.map((d) => d.path) };
  }

  async getProgress(projectId: string): Promise<ProgressView | null> {
    const row = await this.snapshots.findOne({
      where: { project_id: projectId },
      order: { analyzed_at: 'DESC' },
    });
    return row ? toProgressView(row) : null;
  }

  async analyzeProgress(projectId: string, userId: string): Promise<ProgressView> {
    const goals = await this.goals.findOneBy({ project_id: projectId });
    if (!goals?.content_md) {
      throw ApiException.conflict(ErrorCode.CONFLICT, '먼저 목표를 확정해 주세요.');
    }

    const commits = await this.gitIntegration.recentCommits(projectId, userId);
    const prompt = [
      '## 확정된 목표/요구사항',
      goals.content_md,
      '',
      '## 최근 커밋',
      commits.length > 0
        ? commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.message}`).join('\n')
        : '(커밋 이력 없음 — 레포가 연동되지 않았거나 아직 커밋이 없다)',
    ].join('\n');

    const text = await this.gemini.generate({
      systemInstruction: ANALYZE_SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: PROGRESS_RESPONSE_SCHEMA,
      temperature: 0.2,
    });

    const parsed = parseProgress(text);

    const saved = await this.snapshots.save(
      this.snapshots.create({
        project_id: projectId,
        percent: parsed.percent,
        summary: parsed.summary,
        remaining_items: parsed.remaining_items,
        based_on_commit_sha: commits[0]?.sha ?? null,
      }),
    );

    await this.audit.record({
      user_id: userId,
      action: 'project_progress.analyze',
      project_id: projectId,
    });

    return toProgressView(saved);
  }
}

function toProgressView(row: ProjectProgressSnapshot): ProgressView {
  return {
    percent: row.percent,
    summary: row.summary,
    remaining_items: row.remaining_items,
    based_on_commit_sha: row.based_on_commit_sha,
    analyzed_at: row.analyzed_at.toISOString(),
  };
}

/**
 * 스키마를 강제했더라도 다시 확인한다 — `docker-config.generator.ts`의 `parseDockerConfig`와
 * 같은 이유다. percent를 0~100으로 잘라 두는 이유는 모델이 스키마의 `type: integer`는
 * 지키면서 범위를 벗어난 값을 낼 수 있어서다(DB의 `chk_project_progress_percent_range`가
 * 마지막 방어선이지만, 거기서 막히면 사용자에게 502가 아니라 알 수 없는 DB 오류로 보인다).
 */
export function parseProgress(text: string): {
  percent: number;
  summary: string;
  remaining_items: RemainingItem[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답을 해석할 수 없습니다.', 502);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.percent !== 'number' || !Number.isFinite(obj.percent)) {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 percent가 없습니다.', 502);
  }
  if (typeof obj.summary !== 'string') {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 summary가 없습니다.', 502);
  }

  const rawItems = Array.isArray(obj.remaining_items) ? obj.remaining_items : [];
  const remainingItems: RemainingItem[] = rawItems
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      description: typeof item.description === 'string' ? item.description : '',
    }))
    .filter((item) => item.title.trim() !== '');

  return {
    percent: Math.max(0, Math.min(100, Math.round(obj.percent))),
    summary: obj.summary,
    remaining_items: remainingItems,
  };
}
