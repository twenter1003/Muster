import { Module } from '@nestjs/common';
import { join } from 'node:path';
import {
  EnvConfigsController,
  EnvTemplatesController,
  ProjectEnvConfigsController,
} from './env-catalog.controller';
import { EnvTemplatesService } from './env-templates.service';
import { EnvConfigsService } from './env-configs.service';
import { DOCKER_CONFIG_GENERATOR, type DockerConfigGenerator } from './docker-config-generator';
import { GeminiDockerConfigGenerator } from './docker-config.generator';
import { POLICY_GATE, type PolicyGate } from './policy-gate';
import { ENV_CONFIG_EXECUTOR } from './env-config-executor';
import { GitHubActionsExecutor } from './github-actions.executor';
import { EnvWorkflowInstaller } from './env-workflow-installer';
import { AuthModule } from '../auth/auth.module';
import { CliPolicyGate } from './cli-policy-gate';
import { LlmModule } from '../../common/llm/llm.module';
import { GEMINI_CLIENT, type GeminiClient } from '../../common/llm/gemini-client';

/**
 * EnvCatalog — 스택 템플릿, 환경 구성 생성(LLM), Policy Gate.
 * 설계서 Part 1 §3.2 / Part 4 §5.
 *
 * Gemini 백엔드 선택(AI Studio API 키 vs Vertex AI ADC vs 미구성)은 `LlmModule`이
 * 전담한다 — 여기서는 그 결과인 `GeminiClient`만 받아 도커 설정 프롬프트를 씌운다.
 */
@Module({
  // 실행 어댑터가 사용자의 GitHub 액세스 토큰을 쓴다(만료 시 갱신은 그쪽 책임이다).
  imports: [AuthModule, LlmModule],
  controllers: [EnvTemplatesController, ProjectEnvConfigsController, EnvConfigsController],
  providers: [
    EnvTemplatesService,
    EnvConfigsService,
    {
      provide: DOCKER_CONFIG_GENERATOR,
      inject: [GEMINI_CLIENT],
      useFactory: (client: GeminiClient): DockerConfigGenerator =>
        new GeminiDockerConfigGenerator(client),
    },
    // 실행은 사용자 레포의 GitHub Actions가 한다. 근거는 github-actions.executor.ts 주석.
    { provide: ENV_CONFIG_EXECUTOR, useClass: GitHubActionsExecutor },
    EnvWorkflowInstaller,
    {
      provide: POLICY_GATE,
      useFactory: (): PolicyGate =>
        // 규칙은 이미지/마운트에 함께 있다. 경로를 설정으로 빼지 않는 이유는
        // 규칙 위치가 배포 산출물의 일부이지 운영자가 고를 값이 아니기 때문이다.
        new CliPolicyGate(join(process.cwd(), 'policies')),
    },
  ],
})
export class EnvCatalogModule {}
