import { IsString, Length } from 'class-validator';

/** 설계서 없음(이번 기능은 새로 추가됨) — 목표/요구사항 문서를 확정한다. */
export class SaveGoalsDto {
  @IsString()
  @Length(1, 20000, { message: 'content_md는 1~20000자여야 합니다.' })
  content_md!: string;
}
