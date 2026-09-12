import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination/pagination.dto';
import { DOCUMENT_TYPES, type DocumentType } from '../../../database/entities/enums';

/**
 * `GET /documents?type=` — 프로젝트를 가로지르는 문서 목록.
 *
 * ListDocumentsQuery를 그대로 쓰지 않는 이유: 그쪽은 `upload_status`도 받는데, 가로지르는
 * 목록에서 그 필터는 화면이 요구한 적이 없다. 안 쓰는 필터를 열어 두면 조합마다 동작을
 * 보장해야 하고 테스트만 늘어난다. 필요해지면 그때 얹는 편이 싸다.
 *
 * `@IsIn`으로 거르는 이유는 audit.query.ts와 같다 — 모르는 값을 조용히 무시하면 사용자는
 * 걸리지 않은 목록을 걸린 목록으로 읽는다. 400이 맞다.
 */
export class ListAllDocumentsQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsIn(DOCUMENT_TYPES, { message: `type은 ${DOCUMENT_TYPES.join('|')} 중 하나여야 합니다.` })
  type?: DocumentType;
}
