import { Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { createHash } from 'node:crypto';
import type { SecretStore } from './secret-store';

/** 액세스 토큰만 있으면 되므로 GoogleAuth 전체가 아니라 이 모양에만 의존한다(테스트 대체 지점). */
export interface AccessTokenSource {
  getClient(): Promise<{ getAccessToken(): Promise<{ token?: string | null }> }>;
}

const API = 'https://secretmanager.googleapis.com/v1';

/**
 * 프로덕션 시크릿 저장소. GCP Secret Manager를 REST로 부른다.
 *
 * 클라이언트 라이브러리(@google-cloud/secret-manager)를 쓰지 않는 이유는 두 가지다.
 * gRPC 스택이 딸려 와 이미지가 커지는데 Artifact Registry 무료 한도가 0.5 GB(압축)이고,
 * 여기서 쓰는 것은 엔드포인트 넷뿐이다. 인증은 이미 들어와 있는 google-auth-library의
 * ADC로 끝난다 — Cloud Run에서는 메타데이터 서버가, 로컬에서는 사용자 ADC가 답한다.
 *
 * 참조 형식은 `gcp://<시크릿 이름>`이다. `file://`과 섞여 있어도 DB에 남은 참조만 보고
 * 어느 저장소에서 발급됐는지 구분된다.
 */
export class GcpSecretManagerStore implements SecretStore {
  private readonly logger = new Logger(GcpSecretManagerStore.name);

  constructor(
    private readonly projectId: string,
    private readonly auth: AccessTokenSource = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    }),
  ) {}

  async put(name: string, value: string): Promise<string> {
    const id = secretId(name);
    const parent = `projects/${this.projectId}`;

    // 이미 있으면 409다. 만드는 쪽을 먼저 시도하고 409만 넘기는 편이,
    // 조회 후 생성(경합에 그대로 노출된다)보다 단순하고 안전하다.
    const created = await this.call('POST', `${API}/${parent}/secrets?secretId=${id}`, {
      replication: { automatic: {} },
    });
    if (!created.ok && created.status !== 409) {
      throw await failure(created, `시크릿 ${id} 생성 실패`);
    }

    const added = await this.call('POST', `${API}/${parent}/secrets/${id}:addVersion`, {
      payload: { data: Buffer.from(value, 'utf8').toString('base64') },
    });
    if (!added.ok) throw await failure(added, `시크릿 ${id} 버전 추가 실패`);

    const version = ((await added.json()) as { name?: string }).name;
    await this.destroyOlderVersions(id, version);

    return `gcp://${id}`;
  }

  async get(ref: string): Promise<string | null> {
    const id = this.idFromRef(ref);
    if (!id) return null;

    const res = await this.call(
      'GET',
      `${API}/projects/${this.projectId}/secrets/${id}/versions/latest:access`,
    );
    // 없는 시크릿과 폐기된 버전은 각각 404·400이다. 둘 다 "값이 없다"로 접는다 —
    // 호출부(웹훅 서명 검증·GitHub 토큰 조회)가 구분해서 할 일이 없다.
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw await failure(res, `시크릿 ${id} 조회 실패`);

    const body = (await res.json()) as { payload?: { data?: string } };
    const data = body.payload?.data;
    if (data === undefined) return null;
    return Buffer.from(data, 'base64').toString('utf8');
  }

  async delete(ref: string): Promise<void> {
    const id = this.idFromRef(ref);
    if (!id) return;

    const res = await this.call('DELETE', `${API}/projects/${this.projectId}/secrets/${id}`);
    if (res.ok || res.status === 404) return;
    throw await failure(res, `시크릿 ${id} 삭제 실패`);
  }

  /**
   * 방금 만든 것 말고 나머지 활성 버전을 폐기한다.
   *
   * 무료 한도가 **활성 버전 6개**라, 회전할 때마다 버전이 쌓이면 시크릿 넷만으로도 넘긴다.
   * 실패해도 put 자체는 성공으로 둔다 — 새 값은 이미 저장됐고, 여기서 던지면 호출부가
   * 저장되지 않은 줄 알고 재시도해 버전을 하나 더 쌓는다.
   */
  private async destroyOlderVersions(id: string, keep: string | undefined): Promise<void> {
    try {
      const res = await this.call(
        'GET',
        `${API}/projects/${this.projectId}/secrets/${id}/versions?filter=state:ENABLED`,
      );
      if (!res.ok) return;

      const { versions = [] } = (await res.json()) as { versions?: { name: string }[] };
      for (const v of versions) {
        if (v.name === keep) continue;
        await this.call('POST', `${API}/${v.name}:destroy`, {});
      }
    } catch (err) {
      this.logger.warn(`시크릿 ${id}의 이전 버전 정리에 실패했습니다: ${String(err)}`);
    }
  }

  private idFromRef(ref: string): string | null {
    if (!ref.startsWith('gcp://')) {
      this.logger.warn(`이 저장소가 발급하지 않은 참조입니다: ${ref}`);
      return null;
    }
    // 참조가 DB에서 오므로 URL에 넣기 전에 다시 정규화한다.
    return secretId(ref.slice('gcp://'.length));
  }

  private async call(method: string, url: string, body?: unknown): Promise<Response> {
    const client = await this.auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) {
      throw new Error(
        'GCP 자격증명을 가져오지 못했습니다. gcloud auth application-default login이 필요합니다.',
      );
    }

    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
}

/**
 * Secret Manager의 이름 규칙은 `[A-Za-z0-9_-]{1,255}`다.
 * 벗어나면 해시로 바꾼다 — 이름은 사람이 읽는 용도일 뿐이라 잃을 것이 없고,
 * 거부당해 시크릿을 통째로 못 쓰는 것보다 낫다.
 */
function secretId(name: string): string {
  return /^[A-Za-z0-9_-]{1,255}$/.test(name)
    ? name
    : createHash('sha256').update(name).digest('hex');
}

async function failure(res: Response, what: string): Promise<Error> {
  const detail = await res.text().catch(() => '');
  return new Error(`${what} (HTTP ${res.status}) ${detail}`.trim());
}
