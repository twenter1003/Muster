import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../errors/api.exception';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_RESOLVER, type SessionResolver } from './session-resolver';

/**
 * 통합설계서 Part 4 §1: `Authorization: Bearer <token>`.
 * 전역 가드로 등록하고, 예외는 @Public()으로 opt-out 한다 (기본 차단).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_RESOLVER) private readonly sessions: SessionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(req.headers.authorization);
    if (!token) {
      throw ApiException.unauthenticated('Authorization 헤더가 없거나 형식이 올바르지 않습니다.');
    }

    const user = await this.sessions.resolve(token);
    if (!user) {
      throw ApiException.unauthenticated('세션 토큰이 유효하지 않습니다.');
    }

    req.user = user;
    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim() || null;
  }
}
