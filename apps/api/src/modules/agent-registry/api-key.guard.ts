import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../../common/errors/api.exception';
import { ApiKeysService } from '../project-core/api-keys.service';

declare module 'express' {
  interface Request {
    /** ApiKeyGuard가 통과시킨 요청의 소유 프로젝트. */
    apiKeyProjectId?: string;
  }
}

/**
 * 설계서 Part 4 §6 — `POST /agents/:id/runs`는 사람이 아니라 **에이전트**가 호출한다.
 * 사용자 세션이 없으므로 `X-API-Key`(PROJECT_API_KEYS)로 인증한다.
 *
 * 이 가드가 붙는 라우트는 @Public()으로 전역 AuthGuard를 비켜간다. 그러면 인증이
 * 통째로 사라지므로, 여기서 반드시 프로젝트를 확정하고 그 범위 밖은 막아야 한다.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-api-key'];
    const rawKey = Array.isArray(header) ? header[0] : header;

    if (!rawKey) {
      throw ApiException.unauthenticated('X-API-Key 헤더가 필요합니다.');
    }

    const projectId = await this.apiKeys.resolveProject(rawKey);
    if (!projectId) {
      // 없는 키와 폐기된 키를 구분해 알려주지 않는다 — 유효한 키를 탐색할 단서가 된다.
      throw ApiException.unauthenticated('API 키가 유효하지 않습니다.');
    }

    req.apiKeyProjectId = projectId;
    return true;
  }
}
