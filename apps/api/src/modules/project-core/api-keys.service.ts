import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { ProjectApiKey } from '../../database/entities';
import { hashToken } from '../../common/auth/token-hash';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';

/** 응답에 실리는 키 표현. key_hash는 절대 나가지 않는다. */
export interface ApiKeyView {
  id: string;
  label: string;
  /** 마지막 4자. 이 컬럼이 생기기 전에 발급된 키는 null이고, 화면은 말미 없이 가린다. */
  key_suffix: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** 발급되는 키의 접두. 화면이 문자열을 지어내지 않도록 서버가 상수로 갖는다. */
const KEY_PREFIX = 'muster_';

/** 말미로 남기는 자릿수. 마이그레이션의 CHECK와 같은 값이어야 한다. */
const SUFFIX_LENGTH = 4;

const toView = (k: ProjectApiKey): ApiKeyView => ({
  id: k.id,
  label: k.label,
  key_suffix: k.key_suffix,
  created_at: k.created_at.toISOString(),
  revoked_at: k.revoked_at?.toISOString() ?? null,
});

@Injectable()
export class ApiKeysService {
  constructor(@InjectRepository(ProjectApiKey) private readonly keys: Repository<ProjectApiKey>) {}

  /**
   * 키를 발급하고 **원문을 한 번만** 돌려준다. DB에는 해시만 남으므로 재조회할 수 없다.
   * 세션 토큰과 같은 방식이다 — 해시 함수도 그대로 재사용한다.
   */
  async issue(projectId: string, label: string): Promise<ApiKeyView & { key: string }> {
    const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

    const saved = await this.keys.save(
      this.keys.create({
        project_id: projectId,
        key_hash: hashToken(key),
        label,
        key_suffix: key.slice(-SUFFIX_LENGTH),
      }),
    );

    return { ...toView(saved), key };
  }

  async listByProject(projectId: string, page: PageRequest): Promise<Page<ApiKeyView>> {
    const qb = this.keys
      .createQueryBuilder('k')
      .where('k.project_id = :projectId', { projectId })
      .orderBy('k.created_at', 'DESC')
      .addOrderBy('k.id', 'DESC')
      .take(page.limit + 1);

    if (page.after) {
      qb.andWhere('(k.created_at, k.id) < (:ts, :id)', { ts: page.after.ts, id: page.after.id });
    }

    const rows = await qb.getMany();
    const built = buildPage(rows, page.limit, (k) => ({
      ts: k.created_at.toISOString(),
      id: k.id,
    }));
    return { items: built.items.map(toView), next_cursor: built.next_cursor };
  }

  /**
   * 키를 폐기한다. WHERE에 `revoked_at IS NULL`이 있어 두 번 불러도 안전하다 —
   * 목적(그 키로 더는 인증되지 않음)이 이미 달성된 상태이므로 실패로 보지 않는다.
   * 존재 여부는 호출부가 소유권을 확인하며 이미 조회했다.
   */
  async revoke(keyId: string): Promise<void> {
    await this.keys.update({ id: keyId, revoked_at: IsNull() }, { revoked_at: new Date() });
  }

  /** 폐기 권한 검사에 쓸 소유 프로젝트. */
  async projectIdOf(keyId: string): Promise<string | null> {
    const key = await this.keys.findOneBy({ id: keyId });
    return key?.project_id ?? null;
  }

  /**
   * 원문 키로 소유 프로젝트를 찾는다 (설계서 Part 4 §6 — `X-API-Key` 인증).
   *
   * 해시로 조회한다. 원문은 DB에 없으므로 유출된 덤프만으로는 인증할 수 없다.
   * 폐기된 키는 매칭되지 않는다 — revoke가 의미를 가지려면 여기서 걸러야 한다.
   */
  async resolveProject(rawKey: string): Promise<string | null> {
    if (!rawKey) return null;
    const key = await this.keys.findOneBy({ key_hash: hashToken(rawKey), revoked_at: IsNull() });
    return key?.project_id ?? null;
  }
}
