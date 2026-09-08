import { Storage } from '@google-cloud/storage';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import { DOWNLOAD_URL_TTL_MS, UPLOAD_URL_TTL_MS, type ObjectStorage } from './object-storage';

/**
 * GCS 구현.
 *
 * 서비스 계정 **키 파일을 쓰지 않는다.** JSON 키는 그 자체가 평문 자격증명이라
 * 설계서 Part 2 §6.2에 어긋난다. 인증은 ADC로 하고, 서명은 IAM SignBlob API에 위임한다.
 *
 * 서명에는 "누구 이름으로 서명하는가"(서비스 계정 이메일)가 필요하다.
 * - Cloud Run: 메타데이터 서버가 알려주므로 아무것도 안 해도 된다.
 * - 로컬: `gcloud auth application-default login`이 만드는 ADC는 **사용자 계정**이라
 *   그 정보가 없다. 그래서 signerEmail이 주어지면 그 서비스 계정을 가장(impersonate)한다.
 *   scripts/setup-gcs.sh가 부여하는 roles/iam.serviceAccountTokenCreator가 이를 위한 권한이다.
 */
export class GcsObjectStorage implements ObjectStorage {
  private storage?: Storage;

  constructor(
    private readonly bucketName: string,
    private readonly projectId?: string,
    private readonly signerEmail?: string,
  ) {}

  /**
   * Storage 클라이언트를 처음 쓸 때 만든다.
   * 가장 설정은 비동기라 생성자에서 할 수 없고, DocStore를 안 쓰는 환경에서 굳이
   * 인증을 시도해 부팅을 느리게 만들 이유도 없다.
   */
  private async client(): Promise<Storage> {
    if (this.storage) return this.storage;

    const options: ConstructorParameters<typeof Storage>[0] = this.projectId
      ? { projectId: this.projectId }
      : {};

    if (this.signerEmail) {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      options.authClient = new Impersonated({
        sourceClient: await auth.getClient(),
        targetPrincipal: this.signerEmail,
        targetScopes: ['https://www.googleapis.com/auth/cloud-platform'],
        lifetime: 3600,
      });
    }

    this.storage = new Storage(options);
    return this.storage;
  }

  private async file(objectPath: string) {
    return (await this.client()).bucket(this.bucketName).file(objectPath);
  }

  async createUploadUrl(params: {
    objectPath: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_MS);
    // contentType을 서명에 포함한다. 그래야 클라이언트가 선언한 것과 다른 종류의 파일을
    // 같은 URL로 밀어넣을 수 없다.
    const [url] = await (
      await this.file(params.objectPath)
    ).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: params.contentType,
    });
    return { url, expiresAt };
  }

  async createDownloadUrl(params: {
    objectPath: string;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_MS);
    const [url] = await (
      await this.file(params.objectPath)
    ).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
    return { url, expiresAt };
  }

  async delete(objectPath: string): Promise<void> {
    // ignoreNotFound: 없는 객체를 지우는 것은 실패가 아니다 (DESIGN_DRIFT.md 5번).
    await (await this.file(objectPath)).delete({ ignoreNotFound: true });
  }

  async exists(objectPath: string): Promise<boolean> {
    const [exists] = await (await this.file(objectPath)).exists();
    return exists;
  }
}
