import { IsObject, IsOptional, IsString, Length } from 'class-validator';

/** 설계서 Part 4 §5.1 — owner_id는 요청자로 자동 설정되므로 본문에 받지 않는다. */
export class CreateEnvTemplateDto {
  @IsString()
  @Length(1, 200, { message: 'name은 1~200자여야 합니다.' })
  name!: string;

  @IsObject({ message: 'stack_preset은 객체여야 합니다.' })
  stack_preset!: Record<string, unknown>;

  /** 도커 프리셋은 없을 수 있다 — 스택만 정해두고 도커는 매번 생성하는 사용이 자연스럽다. */
  @IsOptional()
  @IsObject({ message: 'docker_preset은 객체여야 합니다.' })
  docker_preset?: Record<string, unknown>;
}
