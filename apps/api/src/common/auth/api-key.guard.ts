import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { ProjectApiKey } from '../../database/entities';
import { ApiException } from '../errors/api.exception';
import { hashToken } from './token-hash';

declare module 'express' {
  interface Request {
    /** ApiKeyGuard가 통과시킨 요청의 소유 프로젝트. */
    apiKeyProjectId?: string;
  }
}

/**
 * 설계서 Part 4 §1 — 에이전트 쓰기 API(`POST /agents/:id/runs`, `POST /projects/:id/logs`)는
 * 사람이 아니라 **에이전트**가 호출한다. 사용자 세션이 없으므로
 * `X-API-Key`(PROJECT_API_KEYS)로 인증한다.
 *
 * 이 가드가 붙는 라우트는 @Public()으로 전역 AuthGuard를 비켜간다. 그러면 인증이
 * 통째로 사라지므로, 여기서 반드시 프로젝트를 확정하고 그 범위 밖은 막아야 한다.
 *
 * agent-registry가 아니라 common에 있는 이유는 ProjectMemberGuard와 같다 —
 * Ingest의 로그 적재 API(§7.2)도 같은 인증을 쓰는데 모듈을 import할 수 없다.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@InjectRepository(ProjectApiKey) private readonly keys: Repository<ProjectApiKey>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-api-key'];
    const rawKey = Array.isArray(header) ? header[0] : header;

    if (!rawKey) {
      throw ApiException.unauthenticated('X-API-Key 헤더가 필요합니다.');
    }

    // 해시로 조회한다. 폐기된 키는 매칭되지 않는다 — revoke가 의미를 가지려면 여기서 걸러야 한다.
    const key = await this.keys.findOneBy({ key_hash: hashToken(rawKey), revoked_at: IsNull() });
    if (!key) {
      // 없는 키와 폐기된 키를 구분해 알려주지 않는다 — 유효한 키를 탐색할 단서가 된다.
      throw ApiException.unauthenticated('API 키가 유효하지 않습니다.');
    }

    req.apiKeyProjectId = key.project_id;
    return true;
  }
}
