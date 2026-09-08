import { Storage } from '@google-cloud/storage';
import {
  DOWNLOAD_URL_TTL_MS,
  UPLOAD_URL_TTL_MS,
  type ObjectStorage,
} from './object-storage';

/**
 * GCS 구현.
 *
 * 서비스 계정 **키 파일을 쓰지 않는다.** JSON 키는 그 자체가 평문 자격증명이라
 * 설계서 Part 2 §6.2에 어긋난다. 대신 ADC(Cloud Run의 메타데이터 서버, 로컬은
 * `gcloud auth application-default login`)로 인증하고, 서명은 IAM SignBlob API에
 * 위임한다 — scripts/setup-gcs.sh가 서비스 계정에 자기 자신에 대한
 * `roles/iam.serviceAccountTokenCreator`를 부여해 두는 이유다.
 */
export class GcsObjectStorage implements ObjectStorage {
  private readonly storage: Storage;

  constructor(
    private readonly bucketName: string,
    projectId?: string,
  ) {
    this.storage = new Storage(projectId ? { projectId } : {});
  }

  private file(objectPath: string) {
    return this.storage.bucket(this.bucketName).file(objectPath);
  }

  async createUploadUrl(params: {
    objectPath: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
    // contentType을 서명에 포함한다. 그래야 클라이언트가 선언한 것과 다른 종류의 파일을
    // 같은 URL로 밀어넣을 수 없다.
    const [url] = await this.file(params.objectPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: params.contentType,
    });
    return { url, expiresAt };
  }

  async createDownloadUrl(params: { objectPath: string }): Promise<{
    url: string;
    expiresAt: Date;
  }> {
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_MS);
    const [url] = await this.file(params.objectPath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });
    return { url, expiresAt };
  }

  async delete(objectPath: string): Promise<void> {
    // ignoreNotFound: 없는 객체를 지우는 것은 실패가 아니다 (DESIGN_DRIFT.md 5번).
    await this.file(objectPath).delete({ ignoreNotFound: true });
  }

  async exists(objectPath: string): Promise<boolean> {
    const [exists] = await this.file(objectPath).exists();
    return exists;
  }
}
