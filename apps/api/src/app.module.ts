import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validateEnvWithProcessEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { ProjectCoreModule } from './modules/project-core/project-core.module';
import { DocStoreModule } from './modules/doc-store/doc-store.module';
import { AgentRegistryModule } from './modules/agent-registry/agent-registry.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SearchModule } from './modules/search/search.module';
import { ProjectGoalsModule } from './modules/project-goals/project-goals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvWithProcessEnv }),
    // 통합설계서 Part 2 §8: 모듈 간 결합은 인프로세스 이벤트로만 한다.
    EventEmitterModule.forRoot({ wildcard: false, verboseMemoryLeak: true }),
    DatabaseModule,
    CommonModule,
    SecretsModule,
    AuthModule,
    // @Global — 다섯 개 모듈이 감사 기록을 남긴다 (audit.module.ts 주석 참조).
    AuditModule,
    ProjectCoreModule,
    DocStoreModule,
    AgentRegistryModule,
    IngestModule,
    RealtimeModule,
    SearchModule,
    ProjectGoalsModule,
  ],
})
export class AppModule {}
