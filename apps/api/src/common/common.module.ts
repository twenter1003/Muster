import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { AuthGuard } from './auth/auth.guard';
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
    // SESSION_RESOLVER는 AuthModule(@Global)이 제공한다.
  ],
})
export class CommonModule {}
