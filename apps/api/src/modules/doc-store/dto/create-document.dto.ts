import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { DOCUMENT_TYPES, type DocumentType } from '../../../database/entities/enums';

export class CreateDocumentDto {
  @IsString()
  @Length(1, 300, { message: 'title은 1~300자여야 합니다.' })
  title!: string;

  @IsIn(DOCUMENT_TYPES, { message: `type은 ${DOCUMENT_TYPES.join('|')} 중 하나여야 합니다.` })
  type!: DocumentType;

  /**
   * 업로드할 파일의 MIME 타입. signed URL 서명에 포함되므로 클라이언트는 같은 값으로
   * 업로드해야 한다. 여기서 고정해 두지 않으면 선언과 다른 종류의 파일이 올라간다.
   */
  @IsString()
  @Matches(/^[\w.+-]+\/[\w.+-]+$/, { message: 'content_type은 MIME 타입 형식이어야 합니다.' })
  @Length(1, 150)
  content_type!: string;

  /** 이 문서가 대응하는 Git 커밋. 선택. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{7,40}$/i, { message: 'commit_ref는 커밋 해시여야 합니다.' })
  commit_ref?: string;
}
