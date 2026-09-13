import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { ProjectInvite, ProjectMember } from '../../database/entities';
import { hashToken } from '../../common/auth/token-hash';
import { ApiException } from '../../common/errors/api.exception';

/** 링크에 실리는 토큰의 접두. 화면이 문자열을 지어내지 않도록 서버가 상수로 갖는다. */
const TOKEN_PREFIX = 'inv_';

/**
 * 기본 유효기간.
 *
 * 7일인 이유: 이 링크의 쓰임새는 "지금 보여 주려고 건네는 것"이다. 그보다 길게 두면 쓰고
 * 잊은 링크가 남고, 짧게 두면 주말을 낀 초대가 상대가 열기 전에 죽는다.
 */
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 30;

export interface IssuedInvite {
  id: string;
  /** 원문 토큰. **발급 응답에만** 실린다 — 이후 조회에는 나오지 않는다. */
  token: string;
  expires_at: string;
}

export interface InviteView {
  id: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  accepted_count: number;
  created_at: string;
  /** 지금 이 링크로 들어올 수 있는가. 만료·폐기를 화면이 각자 계산하지 않게 서버가 답한다. */
  active: boolean;
}

export interface InvitePreview {
  project_id: string;
  project_name: string;
  /** 초대한 사람의 GitHub 계정. 모르는 사람이 부른 링크는 그것만으로 수상하다. */
  invited_by: string | null;
  expires_at: string;
  /** 이미 멤버인가. 수락 버튼 대신 "이미 들어와 있다"를 보여 주기 위해 필요하다. */
  already_member: boolean;
}

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(ProjectInvite) private readonly invites: Repository<ProjectInvite>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    private readonly dataSource: DataSource,
  ) {}

  /** 링크 발급. 원문은 여기서 한 번만 나간다 — DB에는 해시만 남는다. */
  async issue(projectId: string, userId: string, ttlDays?: number): Promise<IssuedInvite> {
    const days = ttlDays ?? DEFAULT_TTL_DAYS;
    if (days < 1 || days > MAX_TTL_DAYS) {
      throw ApiException.validationFailed(`유효기간은 1~${MAX_TTL_DAYS}일이어야 합니다.`);
    }

    const token = `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const saved = await this.invites.save(
      this.invites.create({
        project_id: projectId,
        token_hash: hashToken(token),
        created_by: userId,
        expires_at: expires,
      }),
    );

    return { id: saved.id, token, expires_at: saved.expires_at.toISOString() };
  }

  async listForProject(projectId: string): Promise<InviteView[]> {
    const rows = await this.invites.find({
      where: { project_id: projectId },
      relations: { creator: true },
      order: { created_at: 'DESC' },
    });

    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      created_by: r.creator?.github_login ?? null,
      expires_at: r.expires_at.toISOString(),
      revoked_at: r.revoked_at?.toISOString() ?? null,
      accepted_count: r.accepted_count,
      created_at: r.created_at.toISOString(),
      active: r.revoked_at === null && r.expires_at.getTime() > now,
    }));
  }

  /**
   * 폐기. 이미 폐기됐거나 만료된 링크를 다시 불러도 실패로 보지 않는다 —
   * 목적(그 링크로 더는 들어올 수 없음)이 이미 이뤄진 상태다(API 키 폐기와 같은 판단).
   *
   * 소유 프로젝트 확인은 호출부가 한다(가드는 경로의 :id만 본다).
   */
  async revoke(inviteId: string, projectId: string): Promise<void> {
    await this.invites.update(
      { id: inviteId, project_id: projectId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    );
  }

  /** 폐기 권한 검사에 쓸 소유 프로젝트. */
  async projectIdOf(inviteId: string): Promise<string | null> {
    const invite = await this.invites.findOneBy({ id: inviteId });
    return invite?.project_id ?? null;
  }

  /**
   * 토큰으로 초대를 들여다본다. 수락 전에 "어느 프로젝트에, 누가 불렀는지"를 보여 주기 위한 것.
   *
   * 유효하지 않은 토큰은 전부 같은 404다 — 없는 것·만료된 것·폐기된 것을 구분해 알려 주면
   * 유효한 토큰을 탐색할 단서가 된다.
   */
  async preview(token: string, userId: string): Promise<InvitePreview> {
    const invite = await this.findUsableOrFail(token);

    const already = await this.members.countBy({
      project_id: invite.project_id,
      user_id: userId,
    });

    return {
      project_id: invite.project_id,
      project_name: invite.project?.name ?? '',
      invited_by: invite.creator?.github_login ?? null,
      expires_at: invite.expires_at.toISOString(),
      already_member: already > 0,
    };
  }

  /**
   * 수락 — 멤버로 합류한다.
   *
   * **항상 member다.** owner는 링크로 주지 않는다(엔티티 주석 참조).
   *
   * 이미 멤버면 아무것도 하지 않고 성공으로 답한다. 링크를 두 번 눌렀을 때 에러를 보는 것은
   * 사용자 입장에서 틀린 응답이다 — 원하는 상태(그 프로젝트의 멤버)에 이미 도달해 있다.
   * 그때 accepted_count도 올리지 않는다. 그 숫자의 뜻은 "몇 명이 들어왔나"이지
   * "몇 번 눌렸나"가 아니다.
   */
  async accept(token: string, userId: string): Promise<{ project_id: string; joined: boolean }> {
    const invite = await this.findUsableOrFail(token);

    const already = await this.members.countBy({
      project_id: invite.project_id,
      user_id: userId,
    });
    if (already > 0) return { project_id: invite.project_id, joined: false };

    // 멤버 추가와 사용 횟수 증가를 한 트랜잭션으로 묶는다. 멤버만 늘고 숫자가 안 오르면
    // 소유자가 링크의 사용 정도를 잘못 읽게 된다.
    await this.dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(ProjectMember, {
          project_id: invite.project_id,
          user_id: userId,
          role: 'member',
        }),
      );
      await manager.increment(ProjectInvite, { id: invite.id }, 'accepted_count', 1);
    });

    return { project_id: invite.project_id, joined: true };
  }

  /**
   * 쓸 수 있는 초대만 돌려준다. 없는 토큰·만료·폐기를 **같은 404**로 묶는다.
   * 프로젝트가 soft delete된 경우도 마찬가지다 — 지운 프로젝트의 링크가 살아 있으면 안 된다.
   */
  private async findUsableOrFail(token: string): Promise<ProjectInvite> {
    const invite = await this.invites.findOne({
      where: { token_hash: hashToken(token) },
      relations: { project: true, creator: true },
    });

    const usable =
      invite !== null &&
      invite.revoked_at === null &&
      invite.expires_at.getTime() > Date.now() &&
      invite.project !== null &&
      invite.project.deleted_at === null;

    if (!usable) throw ApiException.notFound('초대를 찾을 수 없습니다.');
    return invite;
  }
}
