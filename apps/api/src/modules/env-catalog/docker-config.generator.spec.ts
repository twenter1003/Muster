import { GeminiDockerConfigGenerator, parseDockerConfig } from './docker-config.generator';
import type { GeminiClient, GeminiGenerateParams } from '../../common/llm/gemini-client';
import { ApiException } from '../../common/errors/api.exception';

class FakeClient implements GeminiClient {
  lastParams: GeminiGenerateParams | null = null;
  response = '';

  async generate(params: GeminiGenerateParams): Promise<string> {
    this.lastParams = params;
    return this.response;
  }
}

describe('GeminiDockerConfigGenerator', () => {
  const stackInput = { language: 'node' };

  it('스택 입력을 프롬프트에 담아 GeminiClient에 넘긴다', async () => {
    const client = new FakeClient();
    client.response = JSON.stringify({ dockerfile: 'FROM node:22-alpine', rationale: '설명' });
    const generator = new GeminiDockerConfigGenerator(client);

    await generator.generate({ stackInput, inputMode: 'ui', templatePreset: null });

    expect(client.lastParams?.prompt).toContain('node');
    expect(client.lastParams?.systemInstruction).toContain('privileged');
    expect(client.lastParams?.responseSchema).toMatchObject({ type: 'object' });
    expect(client.lastParams?.temperature).toBe(0.1);
  });

  it('정상 응답을 GeneratedDockerConfig로 파싱한다', async () => {
    const client = new FakeClient();
    client.response = JSON.stringify({
      dockerfile: 'FROM node:22-alpine',
      compose: 'services: {}',
      rationale: '설명',
    });
    const generator = new GeminiDockerConfigGenerator(client);

    const result = await generator.generate({ stackInput, inputMode: 'ui', templatePreset: null });
    expect(result).toEqual({
      dockerfile: 'FROM node:22-alpine',
      compose: 'services: {}',
      rationale: '설명',
    });
  });

  it('compose가 없으면 null이다', async () => {
    const client = new FakeClient();
    client.response = JSON.stringify({ dockerfile: 'FROM node:22-alpine', rationale: '설명' });
    const generator = new GeminiDockerConfigGenerator(client);

    const result = await generator.generate({ stackInput, inputMode: 'ui', templatePreset: null });
    expect(result.compose).toBeNull();
  });
});

describe('parseDockerConfig', () => {
  it('JSON이 아니면 502를 던진다', () => {
    expect(() => parseDockerConfig('not json')).toThrow(ApiException);
  });

  it('dockerfile이 없으면 502를 던진다', () => {
    expect(() => parseDockerConfig(JSON.stringify({ rationale: '설명' }))).toThrow(ApiException);
  });

  it('dockerfile이 빈 문자열이면 502를 던진다', () => {
    expect(() => parseDockerConfig(JSON.stringify({ dockerfile: '  ', rationale: '' }))).toThrow(
      ApiException,
    );
  });
});
