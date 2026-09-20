import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AGENT_RUN_STATUSES, type AgentRunStatus } from '../../../database/entities/enums';
import { TokenBreakdownDto } from './token-breakdown.dto';

/**
 * 에이전트 실행 시작 또는 과거 세션 백필 생성 DTO.
 * 생략 시 status='running', tokens_used=0, started_at=현재시각으로 생성된다.
 *
 * 토큰 내역 4종(TokenBreakdownDto)을 물려받는다 — 세션 하나에서 모델을 바꿔 쓴 경우
 * 훅이 완료된 실행을 곧바로 여러 건 생성해서 보고할 수 있어야 한다(하트비트로 키웠다가
 * 나중에 고치는 대신, 처음부터 정확한 내역으로 생성).
 */
export class CreateRunDto extends TokenBreakdownDto {
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
