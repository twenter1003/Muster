import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProjectCoreModule } from '../project-core/project-core.module';
import { ProjectMemberGuard } from '../project-core/project-member.guard';
import { DocumentsController, ProjectDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';
import { GcsObjectStorage } from './gcs-object-storage';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * 버킷이 설정되지 않은 환경용 바인딩.
 *
 * 서버가 아예 안 뜨게 하지 않는 이유: DocStore 말고도 기능이 많고, GCP 자격증명 없이
 * 개발하는 경우가 정상 경로다. 대신 DocStore를 건드리는 순간 무엇이 빠졌는지 알려준다.
 * GITHUB_OAUTH_CLIENT_ID가 없을 때 로그인만 503을 내는 것과 같은 방식이다.
 */
class UnconfiguredObjectStorage implements ObjectStorage {
  private fail(): never {
    throw new ApiException(
      ErrorCode.INTERNAL,
      'GCS_BUCKET이 설정되지 않아 문서 저장소를 쓸 수 없습니다. scripts/setup-gcs.sh 참조.',
      503,
    );
  }
  createUploadUrl(): never {
    this.fail();
  }
  createDownloadUrl(): never {
    this.fail();
  }
  delete(): never {
    this.fail();
  }
  exists(): never {
    this.fail();
  }
}

/**
 * DocStore — 문서 메타데이터 + GCS 원본 (설계서 Part 1 §3.1 / Part 4 §4).
 *
 * ProjectMemberGuard가 ProjectsService에 의존하므로 ProjectCoreModule을 들여온다.
 */
@Module({
  imports: [ProjectCoreModule],
  controllers: [ProjectDocumentsController, DocumentsController],
  providers: [
    DocumentsService,
    // 가드는 이 모듈의 인젝터에서 만들어진다. ProjectsService는 ProjectCoreModule이 내보낸다.
    ProjectMemberGuard,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ObjectStorage => {
        const bucket = config.get<string>('GCS_BUCKET');
        if (!bucket) return new UnconfiguredObjectStorage();
        return new GcsObjectStorage(
          bucket,
          config.get<string>('GCP_PROJECT_ID'),
          config.get<string>('GCS_SIGNER_SERVICE_ACCOUNT'),
        );
      },
    },
  ],
})
export class DocStoreModule {}
