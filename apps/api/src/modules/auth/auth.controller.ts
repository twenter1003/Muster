import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly sessions: SessionService) {}

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
