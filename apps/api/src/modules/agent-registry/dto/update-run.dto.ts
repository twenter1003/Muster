import { IsIn, IsInt, IsNumberString, IsOptional, Min } from 'class-validator';
import { AGENT_RUN_STATUSES, type AgentRunStatus } from '../../../database/entities/enums';

/**
 * 설계서 Part 4 §6 — 실행 종료 기록.
 * cost는 문자열로 받는다. 부동소수점으로 금액을 다루면 반올림 오차가 쌓여
 * 예산 임계치 판정이 어긋난다 (AgentRun.cost가 numeric인 것과 같은 이유).
 */
export class UpdateRunDto {
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
  @IsNumberString({ no_symbols: false }, { message: 'cost는 숫자 문자열이어야 합니다.' })
  cost?: string;
}
