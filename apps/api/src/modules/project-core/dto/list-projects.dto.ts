import { IsOptional, IsString } from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination/pagination.dto';

export class ListProjectsQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  tz?: string;
}
