import type { GeminiClient, GeminiGenerateParams } from './gemini-client';

/**
 * 테스트용 더블. 응답을 큐에 미리 채워 두고 호출 순서대로 하나씩 내준다 — 실물 Gemini
 * 없이도 호출자 쪽 파싱·검증 로직을 검증할 수 있다.
 */
export class FakeGeminiClient implements GeminiClient {
  responses: string[] = [];
  calls: GeminiGenerateParams[] = [];
  failNext: Error | null = null;

  async generate(params: GeminiGenerateParams): Promise<string> {
    this.calls.push(params);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    const next = this.responses.shift();
    if (next === undefined) {
      throw new Error('FakeGeminiClient: 큐에 남은 응답이 없습니다.');
    }
    return next;
  }
}
