import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination/pagination.dto';
import { BUILD_STATUSES, type BuildStatus } from '../../../database/entities/enums';

/**
 * `GET /env-configs?build_status=` — 프로젝트를 가로지르는 환경 구성 목록.
 *
 * EnvCatalog 화면의 주된 용도가 "승인 대기·차단된 구성 찾기"라 상태 필터가 목록의 본체다.
 * 프로젝트 하위 목록에는 이 필터가 없지만 거기선 한 프로젝트분이라 눈으로 훑을 수 있었다.
 *
 * `@IsIn`으로 거르는 이유는 audit.query.ts와 같다 — 모르는 값을 조용히 무시하면 사용자는
 * 걸리지 않은 목록을 걸린 목록으로 읽는다. 400이 맞다.
 */
export class ListAllEnvConfigsQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsIn(BUILD_STATUSES, {
    message: `build_status는 ${BUILD_STATUSES.join('|')} 중 하나여야 합니다.`,
  })
  build_status?: BuildStatus;
}
