import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Project, ProjectMember } from '../../database/entities';
import { ApiException } from '../errors/api.exception';

/**
 * 설계서 Part 4 §1 — 프로젝트 하위 리소스 요청은 요청자가 PROJECT_MEMBERS인지 검사한다.
 * MVP는 본인 소유 프로젝트만 존재하므로 사실상 owner 검사지만, 확장 단계에서 로직 변경 없이
 * 그대로 동작한다.
 *
 * 비멤버에게 403이 아니라 404를 주는 이유: 403은 "그 프로젝트는 존재한다"를 알려준다.
 * 남의 프로젝트 ID를 넣어보며 존재 여부를 캐낼 수 있으므로, 없는 것과 구분되지 않게 한다.
 *
 * project-core가 아니라 common에 있는 이유: 가드는 특정 모듈의 소유물이 아니라 횡단
 * 관심사이고, Ingest는 project-core를 import할 수 없는데(Part 2 §8) §7.2의 조회 API에는
 * 이 검사가 필요하다. ProjectsService 대신 리포지토리를 직접 쓰는 것도 같은 이유다 —
 * §8이 막는 것은 "Ingest가 다른 모듈의 서비스를 호출하는 것"이다.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    const projectId: unknown = req.params.id;

    if (!user) throw ApiException.unauthenticated();
    if (!isUuid(projectId)) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');

    // 삭제된 프로젝트와 남의 프로젝트를 같은 응답으로 만든다.
    const [exists, member] = await Promise.all([
      this.projects.countBy({ id: projectId, deleted_at: IsNull() }),
      this.members.countBy({ project_id: projectId, user_id: user.id }),
    ]);

    if (!exists || !member) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
    return true;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** uuid가 아닌 경로 파라미터를 DB로 넘기면 Postgres가 22P02로 터진다. 그 전에 404로 막는다. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
