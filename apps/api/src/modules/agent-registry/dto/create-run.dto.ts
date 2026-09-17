import { IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, Min } from 'class-validator';
import { AGENT_RUN_STATUSES, type AgentRunStatus } from '../../../database/entities/enums';

/**
 * 에이전트 실행 시작 또는 과거 세션 백필 생성 DTO.
 * 생략 시 status='running', tokens_used=0, started_at=현재시각으로 생성된다.
 */
export class CreateRunDto {
  @IsOptional()
  @IsIn(AGENT_RUN_STATUSES, {
    message: `status는 ${AGENT_RUN_STATUSES.join('|')} 중 하나여야 합니다.`,
  })
  status?: AgentRunStatus;

  @IsOptional()
  @IsInt({ message: 'tokens_used는 정수여야 합니다.' })
  @Min(0)
  tokens_used?: number;

  @IsOptional()
  @IsString({ message: 'model은 문자열이어야 합니다.' })
  model?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'cost는 숫자 문자열이어야 합니다.' })
  cost?: string;

  @IsOptional()
  @IsDateString({}, { message: 'started_at은 올바른 ISO 날짜 문자열이어야 합니다.' })
  started_at?: string;

  @IsOptional()
  @IsDateString({}, { message: 'ended_at은 올바른 ISO 날짜 문자열이어야 합니다.' })
  ended_at?: string;
}
