import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination/pagination.dto';
import { AUDIT_ACTIONS, type AuditAction } from '../../../database/entities/enums';

/**
 * `GET /audit-logs?action=` · `GET /projects/:id/audit-logs?action=`.
 *
 * 화면이 클라이언트에서 거르고 있던 것을 서버로 옮긴다. 클라이언트 필터는 **현재 페이지
 * 안에서만** 걸려서, "지난달 api_key.create를 찾아라"에는 쓸 수 없었다(그 기록이 50건 뒤에
 * 있으면 보이지 않는다).
 *
 * 값 하나만 받는다. 묶음(보안·과금 = 키+연동+예산)은 화면이 정의하는 개념이라 서버가
 * 이름을 알 이유가 없고, 묶음을 서버 어휘에 넣으면 화면의 탭 구성이 바뀔 때마다 API가
 * 따라 바뀐다. 여러 값이 필요해지면 그때 배열로 넓히는 편이 싸다.
 */
export class AuditLogQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsIn(AUDIT_ACTIONS, { message: 'action이 알려진 감사 행위가 아닙니다.' })
  action?: AuditAction;
}
