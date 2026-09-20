import { Module } from '@nestjs/common';
import { ProjectGoalsController } from './project-goals.controller';
import { ProjectGoalsService } from './project-goals.service';
import { ProjectCoreModule } from '../project-core/project-core.module';
import { LlmModule } from '../../common/llm/llm.module';

/**
 * ProjectGoals — 목표/요구사항 문서(사람 확정 + AI 초안). 진행률은 프론트엔드가
 * 체크리스트 항목 수로 결정론적으로 계산하므로 이 모듈이 다루지 않는다.
 *
 * `ProjectCoreModule`을 import해 `GitIntegrationService`(repoDocs)를,
 * `LlmModule`을 import해 `GEMINI_CLIENT`를 재사용한다 — 둘 다 새로 배선하지 않는다.
 * 감사 로그는 `AuditModule`이 `@Global`이라 여기서 import하지 않아도 된다.
 */
@Module({
  imports: [ProjectCoreModule, LlmModule],
  controllers: [ProjectGoalsController],
  providers: [ProjectGoalsService],
})
export class ProjectGoalsModule {}
