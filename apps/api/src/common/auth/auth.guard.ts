import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../errors/api.exception';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_RESOLVER, type SessionResolver } from './session-resolver';
import { sessionTokenFrom } from './session-cookie';

/**
 * 통합설계서 Part 4 §1: `Authorization: Bearer <token>`.
 * 전역 가드로 등록하고, 예외는 @Public()으로 opt-out 한다 (기본 차단).
 *
 * 여기에 HttpOnly 쿠키 경로를 더했다. 설계서는 Bearer만 적고 있지만, 브라우저에서 Bearer를
 * 쓰려면 토큰을 JS가 읽을 수 있는 곳에 둬야 하고 그건 XSS 한 방에 세션이 통째로 새는 구조다.
 * 두 방식은 대체가 아니라 용도가 다르다 — 쿠키는 브라우저, Bearer는 CLI·에이전트다.
 *
 * CSRF에 대하여 (쿠키 인증을 붙이면 새로 생기는 표면이다):
 * SameSite=Lax는 교차 사이트에서 오는 POST/PATCH/DELETE에 쿠키를 붙이지 않으므로, 이 API의
 * 상태 변경 요청은 전부 막힌다. 다만 Lax가 못 막는 세 가지가 있다.
 *   1. top-level GET 네비게이션에는 쿠키가 실린다 → 상태를 바꾸는 GET이 생기면 그날로 뚫린다.
 *      현재 그런 엔드포인트는 없고, 없는 상태를 유지하는 것이 여기서의 방어다.
 *   2. Lax는 origin이 아니라 site 단위다 → 같은 등록가능도메인의 다른 서브도메인(HTTP 포함)은
 *      "교차 사이트"가 아니다. 단일 호스트 배포라 지금은 해당 없다.
 *   3. SameSite를 모르는 구형 브라우저는 속성을 무시한다.
 * 그래서 지금은 CSRF 토큰이나 이중 제출 쿠키를 넣지 않는다. 넣으면 방어 하나를 얻는 대신
 * 프론트·CLI 양쪽의 요청 경로가 갈라지고 토큰 수명 관리가 새로 생기는데, 위 1~3이 전부
 * "현재 구조에서는 발생하지 않는 조건"이라 비용이 이득보다 크다. 서브도메인이 생기거나
 * 상태 변경 GET이 필요해지는 순간 다시 판단해야 하며, 그때 가장 싼 추가 방어는
 * 이 가드에서 `Origin`/`Sec-Fetch-Site` 헤더를 검사하는 것이다(Origin이 있는데 우리 것이
 * 아니면 거부 — Origin을 보내지 않는 CLI는 영향받지 않는다).
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
    // Bearer가 먼저다. Authorization 헤더는 호출자가 의도해서 붙인 것이고 쿠키는 브라우저가
    // 자동으로 싣는 것이라, 쿠키에 우선권을 주면 사용자가 명시한 신원이 남은 세션 쿠키에
    // 조용히 덮어써진다(브라우저 기반 API 콘솔에서 실제로 겪는 혼선이다).
    const token = sessionTokenFrom(req.headers);
    if (!token) {
      throw ApiException.unauthenticated('세션 쿠키도 Authorization 헤더도 없습니다.');
    }

    const user = await this.sessions.resolve(token);
    if (!user) {
      throw ApiException.unauthenticated('세션 토큰이 유효하지 않습니다.');
    }

    req.user = user;
    return true;
  }
}
