import { IsIn, IsOptional } from 'class-validator';
import { INBOX_CATEGORIES, type InboxCategory } from '../items';

/**
 * `GET /inbox?category=`.
 *
 * 목업의 필터 탭(전체 · 예산 · Policy · 배포)에 대응한다. "전체"는 파라미터를 생략한 것이다.
 * 페이지네이션 파라미터는 없다 — 이유는 inbox.service.ts 상단 주석 참조.
 */
export class InboxQuery {
  @IsOptional()
  @IsIn(INBOX_CATEGORIES, {
    message: `category는 ${INBOX_CATEGORIES.join('|')} 중 하나여야 합니다.`,
  })
  category?: InboxCategory;
}
