import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { AuthGuard } from './auth/auth.guard';
import { NullSessionResolver, SESSION_RESOLVER } from './auth/session-resolver';
import { HealthController } from './health/health.controller';

/**
 * 공통 레이어: 에러 포맷 필터, 전역 인증 가드, 세션 해석기 바인딩.
 * @Global이라 각 기능 모듈이 별도로 import하지 않아도 provider를 주입받는다.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
    // Phase 3에서 실제 세션 저장소 기반 구현으로 교체한다.
    { provide: SESSION_RESOLVER, useClass: NullSessionResolver },
  ],
  exports: [SESSION_RESOLVER],
})
export class CommonModule {}
