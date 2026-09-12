import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { ProjectApiKey } from '../../database/entities';
import { ApiException } from '../errors/api.exception';
import { hashToken } from './token-hash';
import { SESSION_RESOLVER, type SessionResolver } from './session-resolver';
import { sessionTokenFrom } from './session-cookie';

/**
 * 두 신원 중 하나를 받는다 — **에이전트의 API 키** 또는 **사람의 세션**.
 *
 * 왜 필요한가: `POST /agents/:id/runs`는 ApiKeyGuard만 달고 @Public()으로 전역 AuthGuard를
 * 비켜가고 있었다. 그래서 브라우저에서는 무슨 수를 써도 401이었고(쿠키를 보내도 이 라우트는
 * 세션을 보지 않는다), 개요 화면의 "에이전트 실행" 버튼이 비활성으로 남아 있었다.
 *
 * 왜 사람에게도 여는가: 실행 종료 기록(`PATCH /agent-runs/:id`)은 이미 세션 인증이다
 * ("사람이 대시보드에서 정정할 수도 있어"). 끝은 사람이 적을 수 있는데 시작은 못 적는
 * 비대칭에 근거가 없다. 수동 실행을 기록하거나 빠진 실행을 채워 넣는 일은 실재한다.
 *
 * 왜 라우트를 둘로 나누지 않는가: 두 라우트가 같은 행을 만들면 같은 규칙(예산 확인, 프로젝트
 * 범위)을 두 곳에서 지켜야 하고, 한쪽만 고치는 날 둘이 갈라진다.
 *
 * **키가 먼저다.** AuthGuard가 Bearer를 쿠키보다 먼저 보는 것과 같은 이유로, 호출자가
 * 의도해서 붙인 신원이 브라우저가 자동으로 싣는 쿠키에 덮이면 안 된다. 다만 여기서는
 * 방향이 하나 더 있다 — 키로 인증된 요청에 남의 세션 쿠키가 함께 실려 오는 경우, 어느
 * 신원으로 권한을 볼지가 갈린다. 키를 우선하고 그때 req.user를 **비워 둔다**.
 */
@Injectable()
export class ApiKeyOrSessionGuard implements CanActivate {
  constructor(
    @InjectRepository(ProjectApiKey) private readonly keys: Repository<ProjectApiKey>,
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const header = req.headers['x-api-key'];
    const rawKey = Array.isArray(header) ? header[0] : header;

    if (rawKey) {
      // 폐기된 키는 매칭되지 않는다 — revoke가 의미를 가지려면 여기서 걸러야 한다.
      const key = await this.keys.findOneBy({ key_hash: hashToken(rawKey), revoked_at: IsNull() });
      if (!key) {
        // 없는 키와 폐기된 키를 구분해 알려주지 않는다 — 유효한 키를 탐색할 단서가 된다.
        throw ApiException.unauthenticated('API 키가 유효하지 않습니다.');
      }
      req.apiKeyProjectId = key.project_id;
      // 키로 들어온 요청에 남의 쿠키가 섞여 있어도 사람 신원으로 승격되지 않게 비운다.
      req.user = undefined;
      return true;
    }

    const token = sessionTokenFrom(req.headers);
    if (!token) {
      throw ApiException.unauthenticated('X-API-Key 헤더도 세션도 없습니다.');
    }

    const user = await this.sessions.resolve(token);
    if (!user) {
      throw ApiException.unauthenticated('세션 토큰이 유효하지 않습니다.');
    }

    req.user = user;
    return true;
  }
}
