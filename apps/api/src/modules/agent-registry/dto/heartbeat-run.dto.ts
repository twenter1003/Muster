import { IsInt, IsNumberString, IsOptional, IsString, Min } from 'class-validator';

/**
 * 에이전트 세션 진행 중 실시간 중간 토큰(Heartbeat) 스트리밍 DTO.
 * 작업 진행 중 주기적으로 현재까지의 누적 tokens_used를 전송한다.
 */
export class HeartbeatRunDto {
  @IsInt({ message: 'tokens_used는 정수여야 합니다.' })
  @Min(0, { message: 'tokens_used는 0 이상이어야 합니다.' })
  tokens_used!: number;

  @IsOptional()
  @IsString({ message: 'model은 문자열이어야 합니다.' })
  model?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'cost는 숫자 문자열이어야 합니다.' })
  cost?: string;
}
