import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../../common/errors/api.exception';
import { ProjectsService } from './projects.service';

/**
 * 설계서 Part 4 §1 — 프로젝트 하위 리소스 요청은 요청자가 PROJECT_MEMBERS인지 검사한다.
 * MVP는 본인 소유 프로젝트만 존재하므로 사실상 owner 검사지만, 확장 단계에서 로직 변경 없이
 * 그대로 동작한다.
 *
 * 비멤버에게 403이 아니라 404를 주는 이유: 403은 "그 프로젝트는 존재한다"를 알려준다.
 * 남의 프로젝트 ID를 넣어보며 존재 여부를 캐낼 수 있으므로, 없는 것과 구분되지 않게 한다.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly projects: ProjectsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    const projectId: unknown = req.params.id;

    if (!user) throw ApiException.unauthenticated();
    if (!isUuid(projectId)) throw ApiException.notFound('프로젝트를 찾을 수 없습니다.');

    // 삭제된 프로젝트와 남의 프로젝트를 같은 응답으로 만든다.
    const [exists, member] = await Promise.all([
      this.projects.exists(projectId),
      this.projects.isMember(projectId, user.id),
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
