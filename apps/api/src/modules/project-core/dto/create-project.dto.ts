import { IsString, Length } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @Length(1, 200, { message: 'name은 1~200자여야 합니다.' })
  name!: string;
}
