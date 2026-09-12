import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import type { AuditLog } from '../../database/entities';
import { AuditService } from './audit.service';

/**
 * 응답에 실리는 감사 기록 표현.
 *
 * project_name을 함께 싣는다 — action과 created_at만으로는 "project.delete"가 어느
 * 프로젝트였는지 화면이 말할 수 없고, 클라이언트가 project_id마다 프로젝트를 다시 조회하면
 * 그게 곧 N+1이다. 서버가 조인 한 번으로 해결한다. 프로젝트가 물리 삭제된 기록은 null이다.
 */
interface AuditLogView {
  id: string;
  action: string;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
}

const toView = (a: AuditLog): AuditLogView => ({
  id: a.id,
  action: a.action,
  project_id: a.project_id,
  project_name: a.project?.name ?? null,
  created_at: a.created_at.toISOString(),
});

/** 설계서 Part 4 §8 — 프로젝트 스코프 감사 로그. */
@Controller('projects')
export class ProjectAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get(':id/audit-logs')
  @UseGuards(ProjectMemberGuard)
  async list(
    @Param('id') projectId: string,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<AuditLogView>> {
    const page = await this.audit.listForProject(projectId, toPageRequest(query));
    return { items: page.items.map(toView), next_cursor: page.next_cursor };
  }
}

/**
 * 설계서 Part 4 §8 — 내 전체 감사 이력.
 * 항상 요청자 자신의 기록만 본다 — 남의 user_id를 지정할 방법 자체를 두지 않는다.
 */
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<AuditLogView>> {
    const page = await this.audit.listForUser(user.id, toPageRequest(query));
    return { items: page.items.map(toView), next_cursor: page.next_cursor };
  }
}
