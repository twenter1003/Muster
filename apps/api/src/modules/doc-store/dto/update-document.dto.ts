import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { DOCUMENT_TYPES, type DocumentType } from '../../../database/entities/enums';

/** 설계서 Part 4 §4 — 제목/타입/커밋 참조만 고친다. 파일 자체는 재업로드 대상이다. */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @Length(1, 300)
  title?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  type?: DocumentType;

  /** null을 명시하면 커밋 연결을 끊는다. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9a-f]{7,40}$/i, { message: 'commit_ref는 커밋 해시여야 합니다.' })
  commit_ref?: string | null;
}
