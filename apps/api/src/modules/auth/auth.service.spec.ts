import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OAuthStateService } from './oauth-state.service';
import { ApiException } from '../../common/errors/api.exception';

/**
 * buildAuthorizeUrl의 설정 의존 경로만 좁게 검증한다.
 * ConfigModule.forRoot()가 import 시점에 굳어져 e2e에서는 설정을 바꿔가며 볼 수 없다.
 */
const configWith = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const make = (values: Record<string, string | undefined>) =>
  new AuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new OAuthStateService(configWith({ OAUTH_STATE_SECRET: 'unit-test-secret-0123456789' })),
    configWith(values),
  );

describe('AuthService.buildAuthorizeUrl', () => {
  it('CLIENT_ID가 없으면 503과 함께 어느 설정이 빠졌는지 알려준다', () => {
    const service = make({ API_BASE_URL: 'http://localhost:8080' });

    expect(() => service.buildAuthorizeUrl()).toThrow(ApiException);
    try {
      service.buildAuthorizeUrl();
    } catch (e) {
      expect((e as ApiException).getStatus()).toBe(503);
      expect(JSON.stringify((e as ApiException).getResponse())).toContain('GITHUB_OAUTH_CLIENT_ID');
    }
  });

  it('CLIENT_ID가 빈 문자열이어도 미설정으로 취급한다', () => {
    const service = make({
      GITHUB_OAUTH_CLIENT_ID: '',
      API_BASE_URL: 'http://localhost:8080',
    });
    expect(() => service.buildAuthorizeUrl()).toThrow(ApiException);
  });

  it('API_BASE_URL 끝의 슬래시가 콜백 주소를 깨뜨리지 않는다', () => {
    const service = make({
      GITHUB_OAUTH_CLIENT_ID: 'cid',
      API_BASE_URL: 'http://localhost:8080/',
    });

    const redirectUri = new URL(service.buildAuthorizeUrl()).searchParams.get('redirect_uri');
    expect(redirectUri).toBe('http://localhost:8080/api/v1/auth/github/callback');
  });
});
