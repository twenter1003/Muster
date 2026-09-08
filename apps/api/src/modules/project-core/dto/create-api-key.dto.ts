import { IsString, Length } from 'class-validator';

export class CreateApiKeyDto {
  /** 원문 키를 다시 볼 수 없으므로, 어떤 키인지 알아보는 유일한 수단이다. */
  @IsString()
  @Length(1, 100, { message: 'label은 1~100자여야 합니다.' })
  label!: string;
}
