import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { AuthGuard } from './auth/auth.guard';
import { ApiKeyGuard } from './auth/api-key.guard';
import { ApiKeyOrSessionGuard } from './auth/api-key-or-session.guard';
import { ProjectMemberGuard } from './auth/project-member.guard';
import { HealthController } from './health/health.controller';

/**
 * 공통 레이어: 에러 포맷 필터, 전역 인증 가드, 세션 해석기 바인딩.
 * @Global이라 각 기능 모듈이 별도로 import하지 않아도 provider를 주입받는다.
 *
 * ApiKeyGuard·ProjectMemberGuard도 여기서 제공한다. 가드는 특정 모듈의 소유물이 아니라
 * 횡단 관심사이고, Ingest는 다른 모듈을 import할 수 없는데(Part 2 §8) §7.2의 조회 API에
 * 두 가드가 모두 필요하다. 리포지토리만 주입받으므로 DatabaseModule(@Global) 위에서
 * 어느 모듈의 인젝터에서든 만들어진다.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
    ApiKeyGuard,
    ApiKeyOrSessionGuard,
    ProjectMemberGuard,
    // SESSION_RESOLVER는 AuthModule(@Global)이 제공한다.
  ],
  exports: [ApiKeyGuard, ApiKeyOrSessionGuard, ProjectMemberGuard],
})
export class CommonModule {}
