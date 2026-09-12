import { Module } from '@nestjs/common';
import {
  AgentRunsController,
  AgentsController,
  ProjectAgentsController,
} from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentRunsService } from './agent-runs.service';
import { BudgetService } from './budget.service';

/**
 * AgentRegistry — 에이전트 설정(md), 실행 이력, 프로젝트 예산.
 * 설계서 Part 1 §3.3 / Part 4 §6.
 *
 * ProjectMemberGuard·ApiKeyGuard는 CommonModule(@Global)이 제공한다. 예산 임계치 알림은
 * 다른 모듈을 직접 부르지 않고 EventEmitter2로만 발행한다 (Part 2 §8).
 */
@Module({
  controllers: [ProjectAgentsController, AgentsController, AgentRunsController],
  providers: [AgentsService, AgentRunsService, BudgetService],
})
export class AgentRegistryModule {}
