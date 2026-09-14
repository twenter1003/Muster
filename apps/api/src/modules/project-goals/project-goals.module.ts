import { Module } from '@nestjs/common';
import { ProjectGoalsController } from './project-goals.controller';
import { ProjectGoalsService } from './project-goals.service';
import { ProjectCoreModule } from '../project-core/project-core.module';
import { LlmModule } from '../../common/llm/llm.module';

/**
 * ProjectGoals — 목표/요구사항 문서(사람 확정 + AI 초안) + 진행률 분석.
 *
 * `ProjectCoreModule`을 import해 `GitIntegrationService`(repoDocs·recentCommits)를,
 * `LlmModule`을 import해 `GEMINI_CLIENT`를 재사용한다 — 둘 다 새로 배선하지 않는다.
 * 감사 로그는 `AuditModule`이 `@Global`이라 여기서 import하지 않아도 된다.
 */
@Module({
  imports: [ProjectCoreModule, LlmModule],
  controllers: [ProjectGoalsController],
  providers: [ProjectGoalsService],
})
export class ProjectGoalsModule {}
