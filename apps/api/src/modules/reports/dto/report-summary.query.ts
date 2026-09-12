import { IsISO8601, IsOptional } from 'class-validator';

/**
 * `GET /reports/summary?from=&to=`.
 *
 * ISO 8601만 받는다. `2026-01-01` 같은 날짜만 있는 형태도 ISO 8601이며 UTC 자정으로 해석된다 —
 * 타임존을 받아 서버에서 해석하기 시작하면 "어제"의 경계가 클라이언트마다 달라진다.
 * 구간이 필요한 쪽이 명시적으로 시각을 넘기게 둔다.
 */
export class ReportSummaryQuery {
  @IsOptional()
  @IsISO8601({}, { message: 'from은 ISO 8601 형식이어야 합니다.' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to는 ISO 8601 형식이어야 합니다.' })
  to?: string;
}
