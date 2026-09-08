import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

export const INPUT_MODES = ['ui', 'natural_language'] as const;

/** 설계서 Part 4 §5.2의 요청 예시를 그대로 따른다. */
export class CreateEnvConfigDto {
  /** 템플릿에서 파생하지 않으면 null. */
  @IsOptional()
  @IsUUID('4', { message: 'template_id는 UUID여야 합니다.' })
  template_id?: string | null;

  @IsIn(INPUT_MODES, { message: `input_mode는 ${INPUT_MODES.join('|')} 중 하나여야 합니다.` })
  input_mode!: (typeof INPUT_MODES)[number];

  /**
   * UI 폼 값 또는 자연어 입력. 구조를 고정하지 않는 이유는 설계서가 두 입력 방식을
   * 같은 필드로 받게 했기 때문이다 — 자연어는 `{ "text": "..." }` 형태로 온다.
   */
  @IsObject({ message: 'stack_input은 객체여야 합니다.' })
  stack_input!: Record<string, unknown>;
}
