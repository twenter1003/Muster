import { HttpGeminiClient } from './http-gemini-client';
import { ApiException } from '../errors/api.exception';

/**
 * 실제 요청이 Gemini `generateContent` 문서의 계약과 일치하는지 검증한다.
 * 근거: ai.google.dev/api/generate-content — `POST /v1beta/models/{model}:generateContent`,
 * 인증은 `x-goog-api-key` 헤더, 구조화 출력은 `generationConfig.responseSchema`.
 */
describe('HttpGeminiClient (실제 요청 형태)', () => {
  const client = new HttpGeminiClient('AIza-fake-key', 'gemini-2.5-flash');
  let fetchMock: jest.Mock;

  const respond = (status: number, body: unknown = {}) =>
    ({
      status,
      ok: status < 400,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as Response;

  const okBody = { candidates: [{ content: { parts: [{ text: 'hello' }] } }] };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('문서에 명시된 경로로 POST한다', async () => {
    fetchMock.mockResolvedValue(respond(200, okBody));
    await client.generate({ prompt: '안녕' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(init.method).toBe('POST');
  });

  it('API 키를 x-goog-api-key 헤더로 보낸다', async () => {
    fetchMock.mockResolvedValue(respond(200, okBody));
    await client.generate({ prompt: '안녕' });

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'AIza-fake-key',
    });
  });

  it('prompt를 contents/parts 구조로 보낸다', async () => {
    fetchMock.mockResolvedValue(respond(200, okBody));
    await client.generate({ prompt: '안녕' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: '안녕' }] }]);
    expect(body.systemInstruction).toBeUndefined();
    expect(body.generationConfig).toBeUndefined();
  });

  it('systemInstruction이 있으면 함께 보낸다', async () => {
    fetchMock.mockResolvedValue(respond(200, okBody));
    await client.generate({ prompt: '안녕', systemInstruction: '너는 도우미다' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: '너는 도우미다' }] });
  });

  it('responseSchema가 있으면 JSON 모드로 강제한다', async () => {
    fetchMock.mockResolvedValue(respond(200, okBody));
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    await client.generate({ prompt: '안녕', responseSchema: schema, temperature: 0.1 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig).toEqual({
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
    });
  });

  it('candidates[0].content.parts[0].text를 그대로 돌려준다', async () => {
    fetchMock.mockResolvedValue(respond(200, okBody));
    await expect(client.generate({ prompt: '안녕' })).resolves.toBe('hello');
  });

  it('401/403이면 자격증명 오류로 즉시(재시도 없이 1회) 503을 던진다', async () => {
    fetchMock.mockResolvedValue(respond(403, { error: 'denied' }));
    try {
      await client.generate({ prompt: '안녕' });
      throw new Error('던졌어야 합니다');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiException);
      expect((e as ApiException).getStatus()).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('일시적 500 오류 후 2회차 시도에서 성공하면 정상 복구된다', async () => {
    fetchMock
      .mockResolvedValueOnce(respond(500, { error: 'Internal Server Error' }))
      .mockResolvedValueOnce(respond(200, okBody));

    const res = await client.generate({ prompt: '안녕' });
    expect(res).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429면 최대 재시도(4회) 후 한도 초과 메시지로 503을 던진다', async () => {
    fetchMock.mockResolvedValue(respond(429, { error: 'Quota exceeded' }));
    try {
      await client.generate({ prompt: '안녕' });
      throw new Error('던졌어야 합니다');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiException);
      expect((e as ApiException).getStatus()).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    }
  });

  it('응답에 텍스트가 없으면 502를 던진다', async () => {
    fetchMock.mockResolvedValue(respond(200, { candidates: [] }));
    try {
      await client.generate({ prompt: '안녕' });
      throw new Error('던졌어야 합니다');
    } catch (e) {
      expect((e as ApiException).getStatus()).toBe(502);
    }
  });
});
