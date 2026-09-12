import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination/pagination.dto';
import { LOG_LEVELS, type LogLevel } from '../../../database/entities/enums';

/** 설계서 Part 4 §7.2 — `GET /projects/:id/logs?level=error|warn|info`. */
export class LogQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsIn(LOG_LEVELS, { message: `level은 ${LOG_LEVELS.join('|')} 중 하나여야 합니다.` })
  level?: LogLevel;
}
