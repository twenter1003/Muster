import { Controller, Get, HttpCode, HttpStatus, Post, Query, Redirect, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { Public } from '../../common/auth/public.decorator';
import { ApiException } from '../../common/errors/api.exception';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
  ) {}

  /** 설계서 Part 4 §2 — GitHub 인증 페이지로 리다이렉트. */
  @Public()
  @Get('github/login')
  @Redirect()
  login(): { url: string } {
    return { url: this.auth.buildAuthorizeUrl() };
  }

  /**
   * 설계서 Part 4 §2 — OAuth 콜백.
   * 세션 토큰은 fragment로 실어 프론트로 되돌려보낸다(서버 로그에 남지 않는다).
   */
  @Public()
  @Get('github/callback')
  @Redirect()
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<{ url: string }> {
    if (!code) throw ApiException.validationFailed('code 파라미터가 없습니다.');
    return { url: await this.auth.completeLogin(code, state) };
  }

  /** 설계서 Part 4 §2 — 현재 로그인한 사용자 정보. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * 설계서 Part 4 §2 — 세션 토큰 무효화.
   * 이미 무효화된 토큰이면 가드가 먼저 401을 내므로 여기까지 오지 않는다.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request): Promise<void> {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) await this.sessions.revoke(token);
  }
}
