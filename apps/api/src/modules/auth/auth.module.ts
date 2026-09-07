import { Global, Module } from '@nestjs/common';
import { SESSION_RESOLVER } from '../../common/auth/session-resolver';
import { SessionService } from './session.service';
import { DbSessionResolver } from './db-session.resolver';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthStateService } from './oauth-state.service';
import { GITHUB_OAUTH_CLIENT, HttpGitHubOAuthClient } from './github-oauth.client';

/**
 * Auth — 인증, 세션/토큰 관리.
 * 설계서 Part 1 §3.6 / Part 4 §2.
 *
 * @Global인 이유: CommonModule의 전역 AuthGuard가 SESSION_RESOLVER를 주입받는데,
 * 공통 레이어가 기능 모듈을 import하면 의존 방향이 뒤집힌다. 토큰만 전역으로 공개한다.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    AuthService,
    OAuthStateService,
    { provide: SESSION_RESOLVER, useClass: DbSessionResolver },
    { provide: GITHUB_OAUTH_CLIENT, useClass: HttpGitHubOAuthClient },
  ],
  exports: [SESSION_RESOLVER, SessionService],
})
export class AuthModule {}
