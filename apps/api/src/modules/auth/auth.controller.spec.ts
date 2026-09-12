import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { SESSION_COOKIE_NAME } from '../../common/auth/session-cookie';
import type { SessionService } from './session.service';
import type { AuthService } from './auth.service';

/** setHeader만 기록하는 최소 응답 객체. passthrough라 Nest가 나머지를 처리한다. */
function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    res: { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response,
    headers,
  };
}

const reqWith = (headers: Record<string, string>) => ({ headers }) as unknown as Request;

describe('AuthController.logout', () => {
  const clearSessionCookie = () =>
    `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

  function make() {
    const revoke = jest.fn(async () => undefined);
    const controller = new AuthController(
      { revoke } as unknown as SessionService,
      { clearSessionCookie } as unknown as AuthService,
    );
    return { controller, revoke };
  }

  it('쿠키로 온 세션을 revoke하고 쿠키를 만료시킨다', async () => {
    const { controller, revoke } = make();
    const { res, headers } = fakeRes();

    await controller.logout(reqWith({ cookie: `${SESSION_COOKIE_NAME}=tok` }), res);

    expect(revoke).toHaveBeenCalledWith('tok');
    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });

  it('Bearer로 온 세션도 revoke한다 (CLI 경로)', async () => {
    const { controller, revoke } = make();
    const { res } = fakeRes();

    await controller.logout(reqWith({ authorization: 'Bearer tok' }), res);

    expect(revoke).toHaveBeenCalledWith('tok');
  });

  it('토큰을 못 찾아도 쿠키는 지운다', async () => {
    const { controller, revoke } = make();
    const { res, headers } = fakeRes();

    await controller.logout(reqWith({}), res);

    expect(revoke).not.toHaveBeenCalled();
    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });
});

describe('AuthController.callback', () => {
  it('쿠키를 심고, 리다이렉트 URL에는 토큰을 남기지 않는다', async () => {
    const completeLogin = jest.fn(async () => ({
      redirectUrl: 'http://localhost:5173/',
      setCookie: `${SESSION_COOKIE_NAME}=secret-token; HttpOnly; SameSite=Lax; Path=/`,
    }));
    const controller = new AuthController(
      {} as unknown as SessionService,
      {
        completeLogin,
      } as unknown as AuthService,
    );
    const { res, headers } = fakeRes();

    const result = await controller.callback(res, 'code-1', 'state-1');

    expect(headers['Set-Cookie']).toContain('HttpOnly');
    expect(result.url).toBe('http://localhost:5173/');
    expect(result.url).not.toContain('secret-token');
  });

  it('code가 없으면 400', async () => {
    const controller = new AuthController(
      {} as unknown as SessionService,
      {} as unknown as AuthService,
    );
    const { res } = fakeRes();

    await expect(controller.callback(res, undefined, 'state-1')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
