import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { validateEnv } from './config/env.schema';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProjectCoreModule } from './modules/project-core/project-core.module';
import { DocStoreModule } from './modules/doc-store/doc-store.module';
import { EnvCatalogModule } from './modules/env-catalog/env-catalog.module';
import { AgentRegistryModule } from './modules/agent-registry/agent-registry.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // TechSpec 8장: 모듈 간 결합은 인프로세스 이벤트로만 한다.
    EventEmitterModule.forRoot({ wildcard: false, verboseMemoryLeak: true }),
    CommonModule,
    AuthModule,
    ProjectCoreModule,
    DocStoreModule,
    EnvCatalogModule,
    AgentRegistryModule,
    IngestModule,
    RealtimeModule,
  ],
})
export class AppModule {}
