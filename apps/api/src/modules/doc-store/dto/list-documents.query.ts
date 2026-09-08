import { IsIn, IsOptional } from 'class-validator';
import { CursorPaginationQuery } from '../../../common/pagination/pagination.dto';
import {
  DOCUMENT_TYPES,
  UPLOAD_STATUSES,
  type DocumentType,
  type UploadStatus,
} from '../../../database/entities/enums';

/** 설계서 Part 4 §4의 `?type=`에 `?upload_status=`를 더한다 (DESIGN_DRIFT.md 5번). */
export class ListDocumentsQuery extends CursorPaginationQuery {
  @IsOptional()
  @IsIn(DOCUMENT_TYPES, { message: `type은 ${DOCUMENT_TYPES.join('|')} 중 하나여야 합니다.` })
  type?: DocumentType;

  @IsOptional()
  @IsIn(UPLOAD_STATUSES, {
    message: `upload_status는 ${UPLOAD_STATUSES.join('|')} 중 하나여야 합니다.`,
  })
  upload_status?: UploadStatus;
}
