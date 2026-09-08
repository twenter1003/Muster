import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { ProjectCoreModule } from '../project-core/project-core.module';
import { ProjectMemberGuard } from '../project-core/project-member.guard';
import {
  EnvConfigsController,
  EnvTemplatesController,
  ProjectEnvConfigsController,
} from './env-catalog.controller';
import { EnvTemplatesService } from './env-templates.service';
import { EnvConfigsService } from './env-configs.service';
import {
  DOCKER_CONFIG_GENERATOR,
  type DockerConfigGenerator,
} from './docker-config-generator';
import { VertexDockerConfigGenerator } from './vertex-docker-config.generator';
import { POLICY_GATE, type PolicyGate } from './policy-gate';
import { CliPolicyGate } from './cli-policy-gate';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * API 키가 없는 환경용 바인딩. 서버는 뜨되 환경 구성 생성만 503을 낸다 —
 * GCS_BUCKET이 없을 때 DocStore만 막는 것과 같은 방식이다.
 */
class UnconfiguredGenerator implements DockerConfigGenerator {
  generate(): never {
    throw new ApiException(
      ErrorCode.INTERNAL,
      'GCP_PROJECT_ID가 설정되지 않아 도커 설정을 생성할 수 없습니다.',
      503,
    );
  }
}

/**
 * EnvCatalog — 스택 템플릿, 환경 구성 생성(LLM), Policy Gate.
 * 설계서 Part 1 §3.2 / Part 4 §5.
 */
@Module({
  imports: [ProjectCoreModule],
  controllers: [EnvTemplatesController, ProjectEnvConfigsController, EnvConfigsController],
  providers: [
    EnvTemplatesService,
    EnvConfigsService,
    ProjectMemberGuard,
    {
      provide: DOCKER_CONFIG_GENERATOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DockerConfigGenerator => {
        // Vertex AI는 ADC로 인증하므로 키가 없다. 프로젝트만 있으면 된다.
        const projectId = config.get<string>('GCP_PROJECT_ID');
        if (!projectId) return new UnconfiguredGenerator();
        return new VertexDockerConfigGenerator(
          projectId,
          config.get<string>('VERTEX_LOCATION') ?? 'us-central1',
          config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash',
        );
      },
    },
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
