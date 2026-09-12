import type { ExecutionContext } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { ProjectApiKey } from '../../database/entities';
import { ApiKeyGuard } from './api-key.guard';
import { hashToken } from './token-hash';

/**
 * 이 가드가 붙는 라우트는 @Public()으로 전역 AuthGuard를 비켜간다.
 * 즉 여기서 막지 못하면 인증이 통째로 없는 엔드포인트가 된다.
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';

const contextWith = (headers: Record<string, string | string[]>) => {
  const req: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    req,
  } as unknown as ExecutionContext & { req: Record<string, unknown> };
};

/**
 * 리포지토리를 직접 주입받으므로 스텁도 리포지토리 모양이다.
 * 가드가 넘기는 조건(where)을 그대로 받아 검사에 쓴다.
 */
const guardWith = (findOneBy: (where: { key_hash: string }) => Promise<ProjectApiKey | null>) =>
  new ApiKeyGuard({ findOneBy } as unknown as Repository<ProjectApiKey>);

const keyRow = (projectId: string) => ({ project_id: projectId }) as ProjectApiKey;

describe('ApiKeyGuard', () => {
  it('헤더가 없으면 막는다', async () => {
    const guard = guardWith(async () => keyRow(PROJECT));

    await expect(guard.canActivate(contextWith({}))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('유효하지 않은 키는 막는다', async () => {
    const guard = guardWith(async () => null);

    await expect(
      guard.canActivate(contextWith({ 'x-api-key': 'muster_bogus' })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('없는 키와 폐기된 키를 구분해 알려주지 않는다', async () => {
    const guard = guardWith(async () => null);

    const messages: string[] = [];
    for (const key of ['muster_never_existed', 'muster_revoked']) {
      try {
        await guard.canActivate(contextWith({ 'x-api-key': key }));
      } catch (e) {
        messages.push(JSON.stringify((e as { getResponse(): unknown }).getResponse()));
      }
    }

    expect(messages[0]).toBe(messages[1]);
  });

  it('통과하면 요청에 소유 프로젝트를 실어 준다', async () => {
    const guard = guardWith(async () => keyRow(PROJECT));
    const ctx = contextWith({ 'x-api-key': 'muster_valid' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.req.apiKeyProjectId).toBe(PROJECT);
  });

  it('헤더가 배열로 와도 첫 값을 쓴다', async () => {
    let seen = '';
    const guard = guardWith(async (where) => {
      seen = where.key_hash;
      return keyRow(PROJECT);
    });

    await guard.canActivate(contextWith({ 'x-api-key': ['muster_first', 'muster_second'] }));
    expect(seen).toBe(hashToken('muster_first'));
  });
});
