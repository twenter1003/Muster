import type { ExecutionContext } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { ProjectApiKey } from '../../database/entities';
import { ApiKeyOrSessionGuard } from './api-key-or-session.guard';
import type { AuthenticatedUser } from './authenticated-user';
import type { SessionResolver } from './session-resolver';

/**
 * 이 가드가 붙는 라우트는 @Public()으로 전역 AuthGuard를 비켜간다. 즉 여기서 막지 못하면
 * 인증이 통째로 없는 엔드포인트가 된다. 신원을 하나 더 받게 됐으므로, 특히 **두 신원이
 * 섞였을 때 무엇이 이기는가**를 고정한다 — 거기가 조용히 틀리는 자리다.
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  github_login: 'someone',
} as AuthenticatedUser;

const contextWith = (headers: Record<string, string | string[]>) => {
  const req: Record<string, unknown> = { headers };
  return {
    ctx: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext,
    req,
  };
};

const guardWith = (opts: { key?: ProjectApiKey | null; user?: AuthenticatedUser | null }) =>
  new ApiKeyOrSessionGuard(
    { findOneBy: async () => opts.key ?? null } as unknown as Repository<ProjectApiKey>,
    { resolve: async () => opts.user ?? null } as SessionResolver,
  );

const keyRow = { project_id: PROJECT } as ProjectApiKey;

describe('ApiKeyOrSessionGuard', () => {
  it('유효한 키는 프로젝트를 확정한다', async () => {
    const { ctx, req } = contextWith({ 'x-api-key': 'muster_good' });

    await expect(guardWith({ key: keyRow }).canActivate(ctx)).resolves.toBe(true);
    expect(req.apiKeyProjectId).toBe(PROJECT);
  });

  it('유효한 세션은 사용자를 싣는다', async () => {
    const { ctx, req } = contextWith({ authorization: 'Bearer good' });

    await expect(guardWith({ user: USER }).canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBe(USER);
    expect(req.apiKeyProjectId).toBeUndefined();
  });

  it('쿠키 세션도 받는다 — 브라우저가 실제로 쓰는 경로다', async () => {
    const { ctx, req } = contextWith({ cookie: 'muster_session=good' });

    await expect(guardWith({ user: USER }).canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBe(USER);
  });

  it('둘 다 없으면 막는다', async () => {
    const { ctx } = contextWith({});

    await expect(guardWith({}).canActivate(ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('키가 틀리면 세션이 있어도 막는다 — 호출자가 의도한 신원이 조용히 바뀌면 안 된다', async () => {
    const { ctx } = contextWith({
      'x-api-key': 'muster_bad',
      authorization: 'Bearer good',
    });

    await expect(guardWith({ key: null, user: USER }).canActivate(ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('키가 이기면 세션 사용자는 비워진다 — 두 신원이 한 요청에 공존하지 않는다', async () => {
    const { ctx, req } = contextWith({
      'x-api-key': 'muster_good',
      authorization: 'Bearer good',
    });

    await expect(guardWith({ key: keyRow, user: USER }).canActivate(ctx)).resolves.toBe(true);
    expect(req.apiKeyProjectId).toBe(PROJECT);
    expect(req.user).toBeUndefined();
  });

  it('세션 토큰이 유효하지 않으면 막는다', async () => {
    const { ctx } = contextWith({ authorization: 'Bearer stale' });

    await expect(guardWith({ user: null }).canActivate(ctx)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
