import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SECRET_STORE } from './secret-store';
import { FileSecretStore } from './file-secret-store';

/**
 * 시크릿 저장소 바인딩.
 * 지금은 로컬 파일 구현만 있다. GCP Secret Manager 구현은 실제 배포 시점(Phase 7)에 추가한다.
 */
@Global()
@Module({
  providers: [
    {
      provide: SECRET_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new FileSecretStore(config.get<string>('SECRETS_DIR') ?? '.secrets'),
    },
  ],
  exports: [SECRET_STORE],
})
export class SecretsModule {}
