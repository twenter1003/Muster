import { IsString, Length } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @Length(1, 200, { message: 'name은 1~200자여야 합니다.' })
  name!: string;

  /** 에이전트 설정 마크다운 (Part 1 §3.3). 상한은 DB의 text지만 무제한은 곤란하다. */
  @IsString()
  @Length(0, 200_000, { message: 'config_md는 200,000자 이하여야 합니다.' })
  config_md!: string;
}
