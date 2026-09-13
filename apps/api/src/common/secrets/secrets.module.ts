import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SECRET_STORE } from './secret-store';
import { FileSecretStore } from './file-secret-store';
import { GcpSecretManagerStore } from './gcp-secret-manager-store';

/**
 * 시크릿 저장소 바인딩.
 *
 * `SECRETS_BACKEND`가 고른다. 자동 판별(예: NODE_ENV=production이면 GCP)을 하지 않는 이유는,
 * 잘못 판별되면 **다른 저장소가 발급한 참조를 읽지 못해** 기존 연동이 조용히 401을 내기
 * 때문이다. 어느 쪽인지는 배포하는 사람이 명시한다.
 */
@Global()
@Module({
  providers: [
    {
      provide: SECRET_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get<string>('SECRETS_BACKEND') !== 'gcp') {
          return new FileSecretStore(config.get<string>('SECRETS_DIR') ?? '.secrets');
        }

        const projectId = config.get<string>('GCP_PROJECT_ID');
        if (!projectId) {
          // 여기서 던지면 서버가 아예 뜨지 않는다. 시크릿 없이 뜬 서버는 로그인도
          // 웹훅 검증도 못 하므로, 늦게 발견되는 편이 나쁘다.
          throw new Error('SECRETS_BACKEND=gcp 이면 GCP_PROJECT_ID가 필요합니다.');
        }
        new Logger('SecretsModule').log(`시크릿 저장소: GCP Secret Manager (${projectId})`);
        return new GcpSecretManagerStore(projectId);
      },
    },
  ],
  exports: [SECRET_STORE],
})
export class SecretsModule {}
