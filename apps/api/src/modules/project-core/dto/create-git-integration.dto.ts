import { IsString, Length } from 'class-validator';

export class CreateGitIntegrationDto {
  @IsString()
  @Length(1, 500)
  repo_url!: string;
}
