import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SessionService } from './session.service';
import { AuthService } from './auth.service';
import { Public } from '../../common/auth/public.decorator';
import { ApiException } from '../../common/errors/api.exception';
import { sessionTokenFrom } from '../../common/auth/session-cookie';
import { AuditService } from '../audit/audit.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
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
   * 세션 토큰은 HttpOnly 쿠키로 심고, 리다이렉트 URL에는 싣지 않는다.
   *
   * @Res({ passthrough: true })인 이유: 헤더 하나를 더 붙여야 할 뿐 응답 자체는 Nest가
   * 그리게 둬야 한다. passthrough 없이 res를 잡으면 @Redirect와 전역 예외 필터가 동시에
   * 무력화된다.
   */
  @Public()
  @Get('github/callback')
  @Redirect()
  async callback(
    @Res({ passthrough: true }) res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<{ url: string }> {
    if (!code) throw ApiException.validationFailed('code 파라미터가 없습니다.');

    const { redirectUrl, setCookie } = await this.auth.completeLogin(code, state);
    res.setHeader('Set-Cookie', setCookie);
    return { url: redirectUrl };
  }

  /** 설계서 Part 4 §2 — 현재 로그인한 사용자 정보. */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * 설계서 Part 4 §2 — 세션 토큰 무효화.
   * 이미 무효화된 토큰이면 가드가 먼저 401을 내므로 여기까지 오지 않는다.
   *
   * 쿠키를 지우는 것과 세션을 revoke 하는 것은 **둘 다** 해야 한다. 쿠키만 지우면 토큰은
   * 살아 있어 유출된 사본이 계속 통하고, revoke만 하면 브라우저가 죽은 쿠키를 계속 보내
   * 모든 요청이 401이 된다. 토큰을 못 찾아도 쿠키는 지운다 — 지울 게 없는 상태를 만드는 게
   * 로그아웃의 목적이고, 실패시킬 이유가 없다.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const token = sessionTokenFrom(req.headers);

    if (token) await this.sessions.revoke(token);
    res.setHeader('Set-Cookie', this.auth.clearSessionCookie());
    await this.audit.record({ user_id: user.id, action: 'logout' });
  }
}
