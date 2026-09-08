import { IsNumberString, IsOptional, IsPositive, Max, Min, IsNumber } from 'class-validator';

/** 설계서 Part 4 §6 — 프로젝트 예산. null은 "한도 없음"이다. */
export class PutBudgetDto {
  @IsOptional()
  @IsNumberString({ no_symbols: true }, { message: 'token_limit은 정수 문자열이어야 합니다.' })
  token_limit?: string | null;

  @IsOptional()
  @IsNumberString({ no_symbols: false }, { message: 'cost_limit은 숫자 문자열이어야 합니다.' })
  cost_limit?: string | null;

  @IsOptional()
  @IsNumber({}, { message: 'alert_threshold_pct는 숫자여야 합니다.' })
  @IsPositive()
  @Min(1)
  @Max(100)
  alert_threshold_pct?: number;
}
