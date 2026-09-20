import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AGENT_RUN_STATUSES, type AgentRunStatus } from '../../../database/entities/enums';
import { TokenBreakdownDto } from './token-breakdown.dto';

/**
 * Git repository URL 기반 에이전트 토큰 사용량 자동 라우팅 DTO.
 * 외부 에이전트 훅(Stop, SessionEnd 등)이 현재 작업 중인 Git 주소를 넘겨주면,
 * 서버가 연동된 프로젝트와 에이전트를 자동 식별하여 실행 이력을 적재한다.
 */
export class RecordRunByRepoDto extends TokenBreakdownDto {
  @IsNotEmpty({ message: 'repo_url은 필수입니다.' })
  @IsString({ message: 'repo_url은 문자열이어야 합니다.' })
  repo_url!: string;

  @IsNotEmpty({ message: 'agent_name은 필수입니다.' })
  @IsString({ message: 'agent_name은 문자열이어야 합니다.' })
  agent_name!: string;

  @IsInt({ message: 'tokens_used는 정수여야 합니다.' })
  @Min(0)
  tokens_used!: number;

  @IsOptional()
  @IsString({ message: 'model은 문자열이어야 합니다.' })
  model?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'cost는 숫자 문자열이어야 합니다.' })
  cost?: string;

  @IsOptional()
  @IsIn(AGENT_RUN_STATUSES, {
    message: `status는 ${AGENT_RUN_STATUSES.join('|')} 중 하나여야 합니다.`,
  })
  status?: AgentRunStatus;

  @IsOptional()
  @IsDateString({}, { message: 'started_at은 올바른 ISO 날짜 문자열이어야 합니다.' })
  started_at?: string;

  @IsOptional()
  @IsDateString({}, { message: 'ended_at은 올바른 ISO 날짜 문자열이어야 합니다.' })
  ended_at?: string;
}
