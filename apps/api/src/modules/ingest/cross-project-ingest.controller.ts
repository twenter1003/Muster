import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CursorPaginationQuery } from '../../common/pagination/pagination.dto';
import { toPageRequest, withProjectName, type Page } from '../../common/pagination/paginate';
import { LogQuery } from './dto/log-query.dto';
import { LogsService } from './logs.service';
import { HealthService } from './health.service';
import {
  toHealthView,
  toLogView,
  type HealthSnapshotView,
  type LogView,
} from './project-ingest.controller';

/**
 * 프로젝트를 가로지르는 조회. `@Controller('projects')`와 같은 클래스에 둘 수 없어서
 * (경로 접두사가 다르다) 파일을 나눈다. 뷰 타입과 변환 함수는 프로젝트 단위 컨트롤러의
 * 것을 그대로 쓴다 — 같은 자원을 두 경로로 내보내면서 필드가 갈라지면, 화면은 어느 경로로
 * 받았느냐에 따라 다른 모양을 다뤄야 한다.
 */
@Controller()
export class CrossProjectIngestController {
  constructor(
    private readonly logs: LogsService,
    private readonly health: HealthService,
  ) {}

  @Get('logs')
  async listLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LogQuery,
  ): Promise<Page<LogView & { project_name: string }>> {
    const page = await this.logs.listForMember(user.id, query.level, toPageRequest(query));
    return {
      items: page.items.map((l) => withProjectName(toLogView(l), page.project_names)),
      next_cursor: page.next_cursor,
    };
  }

  @Get('health-snapshots')
  async listHealth(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQuery,
  ): Promise<Page<HealthSnapshotView & { project_name: string }>> {
    const page = await this.health.listForMember(user.id, toPageRequest(query));
    return {
      items: page.items.map((h) => withProjectName(toHealthView(h), page.project_names)),
      next_cursor: page.next_cursor,
    };
  }
}
