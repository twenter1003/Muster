import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { ReportsService, type ReportSummary } from './reports.service';
import { ReportSummaryQuery } from './dto/report-summary.query';

/**
 * 리포트 화면용 집계. 전역 AuthGuard가 적용되므로 인증이 필요하다.
 *
 * ProjectMemberGuard를 쓰지 않는 이유: 그 가드는 `:id` 경로 파라미터 하나를 검사한다.
 * 여기는 대상이 "요청자가 멤버인 모든 프로젝트"라 검사할 id가 없고, 범위 제한은 서비스의
 * 첫 질의(PROJECT_MEMBERS 조인)가 담당한다.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportSummaryQuery,
  ): Promise<ReportSummary> {
    return this.reports.summary(user.id, query);
  }
}
