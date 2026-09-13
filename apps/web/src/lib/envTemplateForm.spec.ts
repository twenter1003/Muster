import { describe, expect, it } from 'vitest';
import {
  buildEnvTemplateBody,
  DEFAULT_STACK_PRESET,
  ENV_TEMPLATE_NAME_MAX,
  type EnvTemplateForm,
} from './envTemplateForm';

const form: EnvTemplateForm = {
  name: '기본 스택',
  stackPresetJson: '{"language":"typescript"}',
  dockerPresetJson: '',
};

describe('buildEnvTemplateBody', () => {
  it('도커 칸이 비면 키를 아예 빼고 보낸다', () => {
    const r = buildEnvTemplateBody(form);

    expect(r).toEqual({
      ok: true,
      body: { name: '기본 스택', stack_preset: { language: 'typescript' } },
    });
    expect(r.ok && 'docker_preset' in r.body).toBe(false);
  });

  it('도커 칸을 채우면 함께 싣는다', () => {
    const r = buildEnvTemplateBody({ ...form, dockerPresetJson: ' {"base":"node:20"} ' });

    expect(r).toEqual({
      ok: true,
      body: {
        name: '기본 스택',
        stack_preset: { language: 'typescript' },
        docker_preset: { base: 'node:20' },
      },
    });
  });

  it('이름 앞뒤 공백은 버리고 보낸다', () => {
    expect(buildEnvTemplateBody({ ...form, name: '  기본 스택 ' })).toEqual({
      ok: true,
      body: { name: '기본 스택', stack_preset: { language: 'typescript' } },
    });
  });

  it('빈 이름과 200자 초과를 막는다', () => {
    expect(buildEnvTemplateBody({ ...form, name: '   ' }).ok).toBe(false);
    expect(buildEnvTemplateBody({ ...form, name: 'a'.repeat(ENV_TEMPLATE_NAME_MAX + 1) }).ok).toBe(
      false,
    );
  });

  it('깨진 JSON은 요청 전에 잡는다', () => {
    // 서버 400을 받아 보여 주면 "생성 실패" 한 줄만 남아 어느 칸이 틀렸는지 알 수 없다.
    expect(buildEnvTemplateBody({ ...form, stackPresetJson: '{language: ts}' })).toEqual({
      ok: false,
      reason: '스택 프리셋이(가) 올바른 JSON이 아니다.',
    });
    expect(buildEnvTemplateBody({ ...form, dockerPresetJson: '{' }).ok).toBe(false);
  });

  it('객체가 아닌 JSON을 거른다 — 서버가 @IsObject로 막는 것들이다', () => {
    for (const bad of ['[1,2]', '3', '"ts"', 'null', 'true']) {
      const r = buildEnvTemplateBody({ ...form, stackPresetJson: bad });
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.reason).toContain('객체');
    }
  });

  it('기본값은 그대로 통과한다', () => {
    const r = buildEnvTemplateBody({ ...form, stackPresetJson: DEFAULT_STACK_PRESET });

    expect(r).toEqual({
      ok: true,
      body: {
        name: '기본 스택',
        stack_preset: {
          language: 'typescript',
          framework: 'nestjs',
          database: 'postgres',
          services: ['redis'],
        },
      },
    });
  });
});
