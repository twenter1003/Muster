import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { EnvTemplate } from '../../database/entities';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import type { CreateEnvTemplateDto } from './dto/create-env-template.dto';

/**
 * 설계서 Part 4 §5.1 — 스택/도커 프리셋.
 *
 * 템플릿은 프로젝트가 아니라 **사용자**에게 귀속된다. 여러 프로젝트에서 재사용되기 때문이다.
 * 그래서 접근 제어도 프로젝트 멤버십이 아니라 owner_id로 한다.
 */
@Injectable()
export class EnvTemplatesService {
  constructor(
    @InjectRepository(EnvTemplate) private readonly templates: Repository<EnvTemplate>,
  ) {}

  async listForOwner(ownerId: string, page: PageRequest): Promise<Page<EnvTemplate>> {
    const qb = this.templates
      .createQueryBuilder('t')
      .where('t.owner_id = :ownerId', { ownerId })
      .orderBy('t.created_at', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .take(page.limit + 1);

    if (page.after) {
      qb.andWhere('(t.created_at, t.id) < (:ts, :id)', { ts: page.after.ts, id: page.after.id });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (t) => ({ ts: t.created_at.toISOString(), id: t.id }));
  }

  async create(ownerId: string, dto: CreateEnvTemplateDto): Promise<EnvTemplate> {
    return this.templates.save(
      this.templates.create({
        owner_id: ownerId,
        name: dto.name,
        stack_preset: dto.stack_preset,
        docker_preset: dto.docker_preset ?? {},
      }),
    );
  }

  /**
   * 설계서 Part 4 §5.1은 삭제에 대해 "owner가 아니면 403"이라고 명시했다.
   * 조회도 같은 기준으로 막되, 여기서는 404를 준다 — 남의 템플릿 id를 넣어보며
   * 존재 여부를 캐낼 수 있어서다. 삭제만 설계서대로 403을 유지한다.
   */
  async detail(templateId: string, userId: string): Promise<EnvTemplate> {
    const template = await this.templates.findOneBy({ id: templateId });
    if (!template || template.owner_id !== userId) {
      throw ApiException.notFound('템플릿을 찾을 수 없습니다.');
    }
    return template;
  }

  async remove(templateId: string, userId: string): Promise<void> {
    const template = await this.templates.findOneBy({ id: templateId });
    if (!template) throw ApiException.notFound('템플릿을 찾을 수 없습니다.');
    if (template.owner_id !== userId) {
      // 설계서 Part 4 §5.1이 이 경우를 403으로 못박았다.
      throw ApiException.forbidden('본인이 만든 템플릿만 삭제할 수 있습니다.');
    }

    // 이 템플릿에서 파생된 환경 구성은 FK가 SET NULL이라 이력으로 남는다.
    await this.templates.delete({ id: template.id });
  }

  /** 환경 구성 생성 시 프리셋을 가져다 쓴다. 남의 템플릿은 쓸 수 없다. */
  async presetFor(templateId: string, userId: string): Promise<Record<string, unknown>> {
    const template = await this.detail(templateId, userId);
    return { ...template.stack_preset, ...template.docker_preset };
  }
}
