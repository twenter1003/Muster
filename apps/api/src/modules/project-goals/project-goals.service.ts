import { Inject, Injectable } from '@nestjs/common';
import { ProjectGoals } from '../../database/entities';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Repository } from 'typeorm';
import { ApiException } from '../../common/errors/api.exception';
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

const DRAFT_SYSTEM_INSTRUCTION = `당신은 소프트웨어 프로젝트의 README와 문서를 읽고 목표/요구사항 문서 초안을 쓴다.

규칙:
- 마크다운으로 쓴다. 제목(##)으로 섹션을 나눈다.
- "이 프로젝트가 무엇을 하는가"와 "무엇을 구현해야 하는가(주요 기능 목록)"를 반드시 포함한다.
- 주요 기능/요구사항 목록은 반드시 마크다운 체크리스트('- [ ]') 형식으로 작성한다.
- 문서에 이미 구현 완료되었다고 명시된 기능은 '- [x]'로, 구현해야 하거나 진행 중인 기능은 '- [ ]'로 작성한다.
- 문서에 없는 내용을 지어내지 않는다. 추측이면 "추정:"을 붙인다.
- 사람이 검토·수정한다는 것을 전제로, 확신이 없는 부분은 짧게 남긴다.`;

/**
 * ProjectGoals — 목표/요구사항 문서(사람 확정 + AI 초안).
 *
 * 진행률은 체크리스트 항목 수로만 센다(프론트엔드 `getGoalsProgressStats`가 결정론적으로
 * 계산). 예전에는 커밋 이력을 Gemini에 넘겨 "이 커밋이 이 항목을 끝냈는지" 판정하고
 * 자동으로 체크박스를 켜는 기능(analyzeProgress)이 있었지만, 수동 체크가 이미 완전한
 * 대안으로 존재하는데 그거 하나 아끼자고 LLM 호출 지연·비용·오판정 위험을 감수할
 * 이유가 없어 제거했다. 초안 생성(draftGoals)은 "문서가 없는 데서 문서를 쓰는" 다른
 * 종류의 작업이라 LLM을 쓸 근거가 분명하므로 그대로 둔다.
 */
@Injectable()
export class ProjectGoalsService {
  constructor(
    @InjectRepository(ProjectGoals) private readonly goals: Repository<ProjectGoals>,
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
}
