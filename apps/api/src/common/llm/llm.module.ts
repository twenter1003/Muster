import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GEMINI_CLIENT, type GeminiClient } from './gemini-client';
import { HttpGeminiClient } from './http-gemini-client';
import { VertexGeminiClient } from './vertex-gemini-client';
import { UnconfiguredGeminiClient } from './unconfigured-gemini-client';

/**
 * LLM — Gemini 호출 백엔드 선택을 한 곳에 모은다.
 *
 * `GEMINI_API_KEY`가 있으면 AI Studio API를 직접 부르고, 없고 `GCP_PROJECT_ID`가 있으면
 * Vertex AI(ADC)로 넘어간다. 둘 다 없으면 `GEMINI_CLIENT`를 쓰는 기능만 503을 낸다.
 * 이 선택 로직은 여기 한 곳에만 있다 — Gemini를 쓰는 다른 모듈(env-catalog, project-goals)이
 * 각자 이 판단을 반복하면 한쪽만 고쳐지는 사고가 난다.
 */
@Module({
  providers: [
    {
      provide: GEMINI_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): GeminiClient => {
        const model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';

        const apiKey = config.get<string>('GEMINI_API_KEY');
        if (apiKey) return new HttpGeminiClient(apiKey, model);

        const projectId = config.get<string>('GCP_PROJECT_ID');
        if (!projectId) return new UnconfiguredGeminiClient();
        return new VertexGeminiClient(
          projectId,
          config.get<string>('VERTEX_LOCATION') ?? 'us-central1',
          config.get<string>('VERTEX_MODEL') ?? 'gemini-2.5-flash',
        );
      },
    },
  ],
  exports: [GEMINI_CLIENT],
})
export class LlmModule {}
