/**
 * 문서 원본 파일 저장소 계약 (설계서 Part 2 §4.1 — 채택: GCS).
 *
 * 파일 바이트는 이 서버를 거치지 않는다. 브라우저가 signed URL로 GCS와 직접 주고받고,
 * 서버는 URL만 발급한다. Cloud Run 인스턴스 메모리와 대역폭을 파일 크기에 묶지 않기 위해서다.
 *
 * GitHubRepoClient와 같은 이유로 인터페이스로 둔다 — GCP 자격증명 없이도 업로드 플로우
 * 전체를 검증할 수 있어야 한다.
 */
export interface ObjectStorage {
  /**
   * 클라이언트가 파일을 PUT 할 수 있는 임시 URL을 발급한다.
   * `contentType`은 서명에 포함되므로, 클라이언트는 같은 값으로 업로드해야 한다.
   */
  createUploadUrl(params: {
    objectPath: string;
    contentType: string;
  }): Promise<{ url: string; expiresAt: Date }>;

  /** 파일을 내려받을 수 있는 임시 URL을 발급한다. */
  createDownloadUrl(params: { objectPath: string }): Promise<{ url: string; expiresAt: Date }>;

  /**
   * 객체를 지운다. 이미 없어도 실패로 보지 않는다 — 업로드가 시작조차 안 된 pending 문서를
   * 지울 때가 있고, "지우려는데 이미 없다"를 실패로 처리하면 레코드를 영영 못 지운다.
   * (DESIGN_DRIFT.md 5번)
   */
  delete(objectPath: string): Promise<void>;

  /** 업로드가 실제로 이뤄졌는지 확인한다. 완료 확인 단계에서 클라이언트 주장을 검증한다. */
  exists(objectPath: string): Promise<boolean>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** signed URL 유효 기간. 업로드는 넉넉히, 조회는 짧게 — 조회 URL이 유출되면 곧 만료돼야 한다. */
export const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_URL_TTL_MS = 5 * 60 * 1000;
