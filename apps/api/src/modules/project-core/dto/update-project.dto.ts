import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PROJECT_STAGES, type ProjectStage } from '../../../database/entities';

/** 설계서 Part 4 §3 — 프로젝트 이름/상태 수정. */
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 200, { message: 'name은 1~200자여야 합니다.' })
  name?: string;

  @IsOptional()
  @IsIn(PROJECT_STAGES, {
    message: `current_stage는 ${PROJECT_STAGES.join(' | ')} 중 하나여야 합니다.`,
  })
  current_stage?: ProjectStage;
}
