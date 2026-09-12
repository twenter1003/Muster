import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { InboxService, type InboxResponse } from './inbox.service';
import { InboxQuery } from './dto/inbox.query';

/**
 * 인박스 화면. 전역 AuthGuard가 적용되므로 인증이 필요하다.
 *
 * ProjectMemberGuard를 쓰지 않는 이유는 ReportsController와 같다: 그 가드는 `:id` 경로
 * 파라미터 하나를 검사하는데 여기는 대상이 "요청자가 멤버인 모든 프로젝트"라 검사할 id가
 * 없다. 범위 제한은 서비스의 첫 질의(PROJECT_MEMBERS 조인)가 담당한다.
 */
@Controller('inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: InboxQuery): Promise<InboxResponse> {
    return this.inbox.list(user.id, { category: query.category });
  }
}
