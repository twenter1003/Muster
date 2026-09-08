import { Module } from '@nestjs/common';
import { ProjectCoreModule } from '../project-core/project-core.module';
import { ProjectMemberGuard } from '../project-core/project-member.guard';
import {
  AgentRunsController,
  AgentsController,
  ProjectAgentsController,
} from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentRunsService } from './agent-runs.service';
import { BudgetService } from './budget.service';
import { ApiKeyGuard } from './api-key.guard';

/**
 * AgentRegistry — 에이전트 설정(md), 실행 이력, 프로젝트 예산.
 * 설계서 Part 1 §3.3 / Part 4 §6.
 *
 * ProjectCoreModule에서 ProjectsService(멤버십 가드용)와 ApiKeysService(X-API-Key 검증용)를
 * 가져온다. 예산 임계치 알림은 다른 모듈을 직접 부르지 않고 EventEmitter2로만 발행한다
 * (Part 2 §8).
 */
@Module({
  imports: [ProjectCoreModule],
  controllers: [ProjectAgentsController, AgentsController, AgentRunsController],
  providers: [AgentsService, AgentRunsService, BudgetService, ProjectMemberGuard, ApiKeyGuard],
})
export class AgentRegistryModule {}
