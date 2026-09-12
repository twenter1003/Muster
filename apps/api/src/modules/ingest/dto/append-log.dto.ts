import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { LOG_LEVELS, type LogLevel } from '../../../database/entities/enums';

/** 로그 한 줄의 상한. 텍스트 컬럼이라 DB는 안 막지만, 한 줄이 수 MB면 조회 API가 먼저 무너진다. */
const MAX_MESSAGE = 4000;

/**
 * 설계서 Part 4 §7.2 — `POST /projects/:id/logs`.
 * 사람이 아니라 외부 에이전트가 호출한다 (X-API-Key 인증).
 */
export class AppendLogDto {
  @IsIn(LOG_LEVELS, { message: `level은 ${LOG_LEVELS.join('|')} 중 하나여야 합니다.` })
  level!: LogLevel;

  @IsString()
  @MinLength(1, { message: 'message는 비어 있을 수 없습니다.' })
  @MaxLength(MAX_MESSAGE, { message: `message는 ${MAX_MESSAGE}자 이하여야 합니다.` })
  message!: string;

  /**
   * 어느 에이전트가 남긴 로그인지. 웹훅·시스템 로그처럼 출처가 에이전트가 아니면 생략한다
   * (LOG_ENTRIES.agent_id가 nullable인 이유).
   */
  @IsOptional()
  @IsUUID('4', { message: 'agent_id는 UUID여야 합니다.' })
  agent_id?: string;
}
