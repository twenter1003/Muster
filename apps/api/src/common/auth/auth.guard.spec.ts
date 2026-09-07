import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { ApiException } from '../errors/api.exception';
import type { SessionResolver } from './session-resolver';
import type { AuthenticatedUser } from './authenticated-user';

const USER: AuthenticatedUser = { id: 'u1', github_login: 'octocat', email: null };

function contextWith(headers: Record<string, string>) {
  const req: { headers: Record<string, string>; user?: AuthenticatedUser } = { headers };
  return {
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext,
    req,
  };
}

function makeGuard(opts: { isPublic?: boolean; resolved?: AuthenticatedUser | null }) {
  const reflector = { getAllAndOverride: () => opts.isPublic ?? false } as unknown as Reflector;
  const sessions: SessionResolver = { resolve: async () => opts.resolved ?? null };
  return new AuthGuard(reflector, sessions);
}

describe('AuthGuard', () => {
  it('@Public 엔드포인트는 토큰 없이 통과시킨다', async () => {
    const { ctx } = contextWith({});
    await expect(makeGuard({ isPublic: true }).canActivate(ctx)).resolves.toBe(true);
  });

  it('Authorization 헤더가 없으면 401 UNAUTHENTICATED', async () => {
    const { ctx } = contextWith({});
    await expect(makeGuard({}).canActivate(ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('Bearer가 아닌 스킴은 거부한다', async () => {
    const { ctx } = contextWith({ authorization: 'Basic abc' });
    await expect(makeGuard({ resolved: USER }).canActivate(ctx)).rejects.toThrow(ApiException);
  });

  it('스킴 대소문자는 구분하지 않는다', async () => {
    const { ctx } = contextWith({ authorization: 'bearer tok' });
    await expect(makeGuard({ resolved: USER }).canActivate(ctx)).resolves.toBe(true);
  });

  it('해석되지 않는 토큰은 401', async () => {
    const { ctx } = contextWith({ authorization: 'Bearer bad' });
    await expect(makeGuard({ resolved: null }).canActivate(ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('유효한 토큰이면 요청에 user를 싣는다', async () => {
    const { ctx, req } = contextWith({ authorization: 'Bearer good' });
    await expect(makeGuard({ resolved: USER }).canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual(USER);
  });
});
