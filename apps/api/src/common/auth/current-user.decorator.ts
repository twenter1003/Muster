import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../errors/api.exception';
import type { AuthenticatedUser } from './authenticated-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user) {
      // 가드를 통과했다면 도달할 수 없다. @Public 엔드포인트에서 잘못 쓴 경우를 잡는다.
      throw ApiException.unauthenticated();
    }
    return user;
  },
);
