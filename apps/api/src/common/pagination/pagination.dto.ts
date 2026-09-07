import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** API 설계 1장: `?cursor=&limit=` (기본 20, 최대 100). */
export class CursorPaginationQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt({ message: 'limit은 정수여야 합니다.' })
  @Min(1, { message: 'limit은 1 이상이어야 합니다.' })
  @Max(MAX_PAGE_LIMIT, { message: `limit은 ${MAX_PAGE_LIMIT} 이하여야 합니다.` })
  limit?: number;
}
