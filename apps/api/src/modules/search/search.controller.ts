import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { SearchService, type SearchResult } from './search.service';
import { SearchQuery } from './dto/search.query';

/**
 * 상단바 검색. 전역 AuthGuard가 적용되므로 인증이 필요하다.
 *
 * ProjectMemberGuard를 쓰지 않는 이유는 Reports·Inbox와 같다: 그 가드는 `:id` 경로
 * 파라미터 하나를 검사하는데 여기는 대상이 "요청자가 멤버인 모든 프로젝트"라 검사할 id가
 * 없다. 범위 제한은 서비스의 첫 질의가 담당한다.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchQuery): Promise<SearchResult> {
    return this.search.search(user.id, query.q);
  }
}
