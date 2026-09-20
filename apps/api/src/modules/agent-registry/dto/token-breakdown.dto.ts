import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * 토큰 내역 4종. 실행을 기록하는 DTO 셋(생성·하트비트·종료)이 함께 물려받는다 —
 * 한 곳만 빠뜨리면 그 경로로 들어온 실행만 조용히 내역 없이 저장되고, 나중에 비용이
 * 왜 어긋나는지 추적하기 어려워진다.
 *
 * 보내지 않아도 된다(선택). 다만 보내지 않으면 서버는 캐시 단가를 적용할 수 없어
 * 합계를 정규 입력가로 계산한다 — 즉 실제보다 비싸게 잡힌다.
 */
export class TokenBreakdownDto {
  @IsOptional()
  @IsInt({ message: 'input_tokens는 정수여야 합니다.' })
  @Min(0)
  input_tokens?: number;

  @IsOptional()
  @IsInt({ message: 'output_tokens는 정수여야 합니다.' })
  @Min(0)
  output_tokens?: number;

  @IsOptional()
  @IsInt({ message: 'cache_read_tokens는 정수여야 합니다.' })
  @Min(0)
  cache_read_tokens?: number;

  @IsOptional()
  @IsInt({ message: 'cache_write_tokens는 정수여야 합니다.' })
  @Min(0)
  cache_write_tokens?: number;
}
