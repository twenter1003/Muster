import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200_000)
  config_md?: string;
}
