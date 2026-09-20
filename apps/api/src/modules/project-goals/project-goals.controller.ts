import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import {
  ProjectGoalsService,
  type DraftGoalsResult,
  type GoalsView,
} from './project-goals.service';
import { SaveGoalsDto } from './dto/save-goals.dto';

/**
 * 목표/요구사항 문서. `doc-store`의 `ProjectDocumentsController`처럼
 * `projects.controller.ts`를 더 불리지 않고 별도 컨트롤러로 둔다.
 */
@Controller('projects')
export class ProjectGoalsController {
  constructor(private readonly goals: ProjectGoalsService) {}

  @Get(':id/goals')
  @UseGuards(ProjectMemberGuard)
  async getGoals(@Param('id') id: string): Promise<GoalsView> {
    return this.goals.getGoals(id);
  }

  @Post(':id/goals/draft')
  @UseGuards(ProjectMemberGuard)
  async draftGoals(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DraftGoalsResult> {
    return this.goals.draftGoals(id, user.id);
  }

  @Patch(':id/goals')
  @UseGuards(ProjectMemberGuard)
  async saveGoals(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveGoalsDto,
  ): Promise<GoalsView> {
    return this.goals.saveGoals(id, user.id, dto.content_md);
  }
}
