import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import type { GeminiClient } from './gemini-client';

/**
 * API 키가 없는 환경용 바인딩. 서버는 뜨되 LLM을 쓰는 기능만 503을 낸다.
 */
export class UnconfiguredGeminiClient implements GeminiClient {
  generate(): never {
    throw new ApiException(
      ErrorCode.INTERNAL,
      'GEMINI_API_KEY도 GCP_PROJECT_ID도 없어 LLM 기능을 쓸 수 없습니다.',
      503,
    );
  }
}
