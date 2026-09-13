import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Project, ProjectMember } from '../../database/entities';
import { ApiException } from '../errors/api.exception';

/**
 * ProjectMemberGuard의 owner 전용 판.
 *
 * 기존 가드는 "멤버인가"까지만 본다. 초대 링크를 만들고 폐기하는 일은 멤버를 늘리는 일이라
 * 멤버 아무나 할 수 있으면 안 된다 — 한 번 들어온 사람이 다음 사람을 부르고, 소유자는
 * 그 사실을 모른 채 프로젝트가 퍼진다.
 *
 * **권한 부족도 404다.** 403으로 답하면 "그 프로젝트는 있는데 너는 owner가 아니다"를
 * 알려 주는 셈이고, 멤버가 아닌 사람에게는 존재 여부 자체가 새어선 안 된다.
 * 멤버이지만 owner가 아닌 경우도 같은 응답으로 묶는다 — 응답이 갈리면 그 차이가 곧 정보다.
 */
@Injectable()
export class ProjectOwnerGuard implements CanActivate {
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

    const [exists, owner] = await Promise.all([
      this.projects.countBy({ id: projectId, deleted_at: IsNull() }),
      this.members.countBy({ project_id: projectId, user_id: user.id, role: 'owner' }),
    ]);

    if (!exists || !owner) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');
    return true;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** uuid가 아닌 경로 파라미터를 DB로 넘기면 Postgres가 22P02로 터진다. 그 전에 404로 막는다. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
