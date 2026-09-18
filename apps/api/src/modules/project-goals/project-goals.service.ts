import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import {
  ProjectGoals,
  ProjectMember,
  ProjectProgressSnapshot,
  type RemainingItem,
} from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { DomainEvent, type CodePushedEvent } from '../../common/events/domain-events';
import { GEMINI_CLIENT, type GeminiClient } from '../../common/llm/gemini-client';
import { GitIntegrationService } from '../project-core/git-integration.service';
import { AuditService } from '../audit/audit.service';
import {
  calculateProgressPercent,
  parseGoalChecklist,
  updateChecklistContent,
} from './goal-checklist';

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

export interface CompletedItemReport {
  index: number;
  commit_sha: string;
  reason: string;
}

export interface ParsedProgress {
  completed_items: CompletedItemReport[];
  summary: string;
  legacy_percent?: number;
  legacy_remaining_items?: RemainingItem[];
}

const DRAFT_SYSTEM_INSTRUCTION = `당신은 소프트웨어 프로젝트의 README와 문서를 읽고 목표/요구사항 문서 초안을 쓴다.

규칙:
- 마크다운으로 쓴다. 제목(##)으로 섹션을 나눈다.
- "이 프로젝트가 무엇을 하는가"와 "무엇을 구현해야 하는가(주요 기능 목록)"를 반드시 포함한다.
- 주요 기능/요구사항 목록은 반드시 마크다운 체크리스트('- [ ]') 형식으로 작성한다.
- 문서에 이미 구현 완료되었다고 명시된 기능은 '- [x]'로, 구현해야 하거나 진행 중인 기능은 '- [ ]'로 작성한다.
- 문서에 없는 내용을 지어내지 않는다. 추측이면 "추정:"을 붙인다.
- 사람이 검토·수정한다는 것을 전제로, 확신이 없는 부분은 짧게 남긴다.`;

const ANALYZE_SYSTEM_INSTRUCTION = `당신은 프로젝트의 미완료 목표 항목과 최근 커밋 이력을 대조하여 구현이 완료된 항목을 엄격히 판별한다.

규칙:
- completed_items: 커밋 이력에서 실제 구현된 흔적이 명확히 확인된 미완료 항목의 인덱스(index)와 증거 커밋 해시(commit_sha), 달성 근거(reason)를 반환한다.
- 확실한 구현 근거가 있는 경우에만 완료로 판정한다. 부분적 구현이나 불확실한 경우 완료에 포함하지 않는다.
- summary는 한국어 2~3문장으로, 어떤 커밋으로 어떤 목표가 달성되었는지와 앞으로 남은 주요 과제를 명확히 요약한다.`;

const PROGRESS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    completed_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          commit_sha: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['index', 'commit_sha', 'reason'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['completed_items', 'summary'],
} as const;

@Injectable()
export class ProjectGoalsService {
  private readonly logger = new Logger(ProjectGoalsService.name);
  readonly lastAutoAnalysisMap = new Map<string, number>();
  readonly COOLDOWN_MS = 10 * 60 * 1000; // 10분 쿨다운

  constructor(
    @InjectRepository(ProjectGoals) private readonly goals: Repository<ProjectGoals>,
    @InjectRepository(ProjectProgressSnapshot)
    private readonly snapshots: Repository<ProjectProgressSnapshot>,
    @Inject(GEMINI_CLIENT) private readonly gemini: GeminiClient,
    private readonly gitIntegration: GitIntegrationService,
    private readonly audit: AuditService,
    @InjectRepository(ProjectMember) private readonly members?: Repository<ProjectMember>,
  ) {}

  @OnEvent(DomainEvent.CODE_PUSHED, { async: true })
  async handleCodePushed(event: CodePushedEvent): Promise<void> {
    const projectId = event.project_id;
    const now = Date.now();
    const lastRun = this.lastAutoAnalysisMap.get(projectId) || 0;

    if (now - lastRun < this.COOLDOWN_MS) {
      this.logger.log(
        `프로젝트(${projectId}) 코드 푸시 감지: 10분 쿨다운 중이므로 목표 자동 갱신을 건너뜁니다.`,
      );
      return;
    }

    // 목표 문서가 등록되어 있는지 확인
    const goals = await this.goals.findOneBy({ project_id: projectId });
    if (!goals?.content_md) {
      return;
    }

    this.lastAutoAnalysisMap.set(projectId, now);

    try {
      this.logger.log(`프로젝트(${projectId}) 코드 푸시로 인한 목표 진행률 자동 갱신 시작`);
      await this.analyzeProgress(projectId);
      this.logger.log(`프로젝트(${projectId}) 목표 진행률 자동 갱신 완료`);
    } catch (err) {
      this.logger.warn(
        `프로젝트(${projectId}) 목표 진행률 자동 갱신 중 오류: ${(err as Error)?.message ?? err}`,
      );
    }
  }

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
        '분석할 문서(README.md 등)를 찾지 못했습니다. 레포지토리에 마크다운 문서가 있는지 확인해 주세요.',
      );
    }

    const prompt = [
      '다음 프로젝트 문서들을 읽고 목표 문서를 작성해 주세요:',
      ...docs.map((d) => `\n---\n### ${d.path}\n\n${d.content}\n`),
    ].join('\n');

    const contentMd = await this.gemini.generate({
      systemInstruction: DRAFT_SYSTEM_INSTRUCTION,
      prompt,
      temperature: 0.2,
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

  async analyzeProgress(projectId: string, userId?: string): Promise<ProgressView> {
    let effectiveUserId = userId;
    if (!effectiveUserId && this.members) {
      const owner = await this.members.findOne({
        where: { project_id: projectId, role: 'owner' },
      });
      const anyMember = owner ?? (await this.members.findOne({ where: { project_id: projectId } }));
      if (anyMember) {
        effectiveUserId = anyMember.user_id;
      }
    }

    const goals = await this.goals.findOneBy({ project_id: projectId });
    if (!goals?.content_md) {
      throw ApiException.conflict(ErrorCode.CONFLICT, '먼저 목표를 확정해 주세요.');
    }

    const items = parseGoalChecklist(goals.content_md);
    const commits = effectiveUserId
      ? await this.gitIntegration.recentCommits(projectId, effectiveUserId)
      : [];

    // 1) 체크리스트 항목이 없는 경우
    if (items.length === 0) {
      const prompt = [
        '## 확정된 목표/요구사항',
        goals.content_md,
        '',
        '## 최근 커밋',
        commits.length > 0
          ? commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.message}`).join('\n')
          : '(커밋 이력 없음)',
      ].join('\n');

      const text = await this.gemini.generate({
        systemInstruction: ANALYZE_SYSTEM_INSTRUCTION,
        prompt,
        responseSchema: PROGRESS_RESPONSE_SCHEMA,
        temperature: 0.1,
      });

      const parsed = parseProgress(text);
      const fallbackPercent = parsed.legacy_percent ?? 0;
      const fallbackRemaining =
        parsed.legacy_remaining_items && parsed.legacy_remaining_items.length > 0
          ? parsed.legacy_remaining_items
          : [];

      const saved = await this.snapshots.save(
        this.snapshots.create({
          project_id: projectId,
          percent: fallbackPercent,
          summary: parsed.summary,
          remaining_items: fallbackRemaining,
          based_on_commit_sha: commits[0]?.sha ?? null,
        }),
      );

      if (effectiveUserId) {
        await this.audit.record({
          user_id: effectiveUserId,
          action: 'project_progress.analyze',
          project_id: projectId,
        });
      }

      return toProgressView(saved);
    }

    const uncompleted = items.filter((item) => !item.completed);

    // 2) 이미 모든 목표 항목이 완료된 경우 (Gemini 호출 불필요)
    if (uncompleted.length === 0) {
      const saved = await this.snapshots.save(
        this.snapshots.create({
          project_id: projectId,
          percent: 100,
          summary: `모든 목표 항목(${items.length}개)이 완료되었습니다.`,
          remaining_items: [],
          based_on_commit_sha: commits[0]?.sha ?? null,
        }),
      );

      if (effectiveUserId) {
        await this.audit.record({
          user_id: effectiveUserId,
          action: 'project_progress.analyze',
          project_id: projectId,
        });
      }

      return toProgressView(saved);
    }

    // 3) 커밋 이력이 없는 경우 (Gemini 호출 불필요, 기존 체크된 비율로 결정론적 산출)
    if (commits.length === 0) {
      const currentPercent = calculateProgressPercent(items);
      const remaining: RemainingItem[] = uncompleted.map((it) => ({
        title: it.title,
        description: '연동된 커밋 이력이 없습니다.',
      }));

      const saved = await this.snapshots.save(
        this.snapshots.create({
          project_id: projectId,
          percent: currentPercent,
          summary: '연동된 커밋 이력이 없어 진행 상황을 추가 확인할 수 없습니다.',
          remaining_items: remaining,
          based_on_commit_sha: null,
        }),
      );

      if (effectiveUserId) {
        await this.audit.record({
          user_id: effectiveUserId,
          action: 'project_progress.analyze',
          project_id: projectId,
        });
      }

      return toProgressView(saved);
    }

    // 4) 미완료 항목과 커밋이 있는 경우: Gemini를 통해 완료 여부 매칭 검증
    const prompt = [
      '## 검증 대상 미완료 목표 목록 (인덱스는 아래 번호 사용)',
      ...uncompleted.map((it) => `- [index: ${it.index}] ${it.title}`),
      '',
      '## 최근 커밋 이력',
      ...commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.message}`),
    ].join('\n');

    const text = await this.gemini.generate({
      systemInstruction: ANALYZE_SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: PROGRESS_RESPONSE_SCHEMA,
      temperature: 0.1,
    });

    const parsed = parseProgress(text);

    // 신규 완료된 인덱스 검증
    const uncompletedIndexSet = new Set(uncompleted.map((it) => it.index));
    const verifiedCompletedIndices = parsed.completed_items
      .map((it) => it.index)
      .filter((idx) => uncompletedIndexSet.has(idx));

    // content_md 갱신: 검증된 항목을 [x]로 업데이트하여 DB에 저장
    let currentContentMd = goals.content_md;
    if (verifiedCompletedIndices.length > 0) {
      currentContentMd = updateChecklistContent(currentContentMd, verifiedCompletedIndices);
      await this.goals.update({ id: goals.id }, { content_md: currentContentMd });
    }

    // 최신 상태 기반 항목 파싱 및 결정론적 진행률 산출
    const updatedItems = parseGoalChecklist(currentContentMd);
    const deterministicPercent = calculateProgressPercent(updatedItems);

    // 레거시 응답 호환: 신규 항목이 없고 레거시 percent가 제공된 경우 fallback
    const finalPercent =
      parsed.completed_items.length === 0 &&
      parsed.legacy_percent !== undefined &&
      updatedItems.length === 0
        ? parsed.legacy_percent
        : deterministicPercent;

    const stillUncompleted = updatedItems.filter((it) => !it.completed);
    const remainingItems: RemainingItem[] =
      parsed.legacy_remaining_items &&
      parsed.legacy_remaining_items.length > 0 &&
      stillUncompleted.length === 0
        ? parsed.legacy_remaining_items
        : stillUncompleted.map((it) => ({
            title: it.title,
            description: '아직 구현 커밋이 확인되지 않았습니다.',
          }));

    const saved = await this.snapshots.save(
      this.snapshots.create({
        project_id: projectId,
        percent: finalPercent,
        summary: parsed.summary,
        remaining_items: remainingItems,
        based_on_commit_sha: commits[0]?.sha ?? null,
      }),
    );

    if (effectiveUserId) {
      await this.audit.record({
        user_id: effectiveUserId,
        action: 'project_progress.analyze',
        project_id: projectId,
      });
    }

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
 * Gemini의 응답을 파싱한다.
 *
 * 신규 스키마(`completed_items`, `summary`) 및 기존 레거시 스키마(`percent`, `remaining_items`)를
 * 모두 안전하게 파싱하여 하위 호환성을 유지한다.
 */
export function parseProgress(text: string): ParsedProgress {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답을 해석할 수 없습니다.', 502);
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.summary !== 'string') {
    throw new ApiException(ErrorCode.INTERNAL, 'LLM 응답에 summary가 없습니다.', 502);
  }

  const hasCompletedItemsField = Array.isArray(obj.completed_items);
  const hasLegacyPercent = typeof obj.percent === 'number' && Number.isFinite(obj.percent);

  if (!hasCompletedItemsField && !hasLegacyPercent) {
    throw new ApiException(
      ErrorCode.INTERNAL,
      'LLM 응답에 completed_items 또는 percent가 없습니다.',
      502,
    );
  }

  const rawCompleted = Array.isArray(obj.completed_items) ? obj.completed_items : [];
  const completedItems: CompletedItemReport[] = rawCompleted
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .filter(
      (item) => typeof item.index === 'number' && Number.isInteger(item.index) && item.index >= 0,
    )
    .map((item) => ({
      index: item.index as number,
      commit_sha: typeof item.commit_sha === 'string' ? item.commit_sha : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
    }));

  let legacyPercent: number | undefined;
  if (hasLegacyPercent) {
    legacyPercent = Math.max(0, Math.min(100, Math.round(obj.percent as number)));
  }

  const rawRemaining = Array.isArray(obj.remaining_items) ? obj.remaining_items : [];
  const legacyRemaining: RemainingItem[] = rawRemaining
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title : '',
      description: typeof item.description === 'string' ? item.description : '',
    }))
    .filter((item) => item.title.trim() !== '');

  return {
    completed_items: completedItems,
    summary: obj.summary,
    legacy_percent: legacyPercent,
    legacy_remaining_items: legacyRemaining,
  };
}
