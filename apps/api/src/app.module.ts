import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validateEnvWithProcessEnv } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { SecretsModule } from './common/secrets/secrets.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectCoreModule } from './modules/project-core/project-core.module';
import { DocStoreModule } from './modules/doc-store/doc-store.module';
import { EnvCatalogModule } from './modules/env-catalog/env-catalog.module';
import { AgentRegistryModule } from './modules/agent-registry/agent-registry.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvWithProcessEnv }),
    // 통합설계서 Part 2 §8: 모듈 간 결합은 인프로세스 이벤트로만 한다.
    EventEmitterModule.forRoot({ wildcard: false, verboseMemoryLeak: true }),
    DatabaseModule,
    CommonModule,
    SecretsModule,
    AuthModule,
    ProjectCoreModule,
    DocStoreModule,
    EnvCatalogModule,
    AgentRegistryModule,
    IngestModule,
    RealtimeModule,
    // 설계서 Part 2 §2의 7개 모듈 목록에 없는 신설 모듈 (reports.module.ts 주석 참조).
    ReportsModule,
  ],
})
export class AppModule {}
