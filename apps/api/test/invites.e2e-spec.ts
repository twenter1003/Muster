import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { ProjectInvite, Session, User } from '../src/database/entities';

/**
 * 프로젝트 초대 링크.
 *
 * 링크 하나가 곧 프로젝트 접근 권한이라, 여기서 무겁게 보는 것은 세 가지다:
 * 누가 만들 수 있는가(owner만), 언제 못 쓰게 되는가(만료·폐기·프로젝트 삭제),
 * 그리고 두 번 눌렀을 때 무슨 일이 벌어지는가.
 */
describe('Phase 7 — 초대 링크 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let sessions: SessionService;

  let owner: User;
  let guest: User;
  let stranger: User;
  let ownerToken: string;
  let guestToken: string;
  let strangerToken: string;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createUser = async (login: string): Promise<User> => {
    const repo = ds.getRepository(User);
    return repo.save(repo.create({ github_login: login, email: null }));
  };

  const issueInvite = async (token = ownerToken, body: object = {}) => {
    const res = await http()
      .post(`/api/v1/projects/${projectId}/invites`)
      .set(auth(token))
      .send(body)
      .expect(201);
    return res.body as { id: string; token: string; expires_at: string };
  };

  const members = async (): Promise<string[]> => {
    const res = await http()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(auth(ownerToken))
      .expect(200);
    return (res.body.items as { github_login: string }[]).map((m) => m.github_login);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    ds = app.get<DataSource>(DATA_SOURCE);
    sessions = app.get(SessionService);

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    owner = await createUser(`inv-owner-${stamp}`);
    guest = await createUser(`inv-guest-${stamp}`);
    stranger = await createUser(`inv-stranger-${stamp}`);
    ownerToken = (await sessions.issue(owner.id)).token;
    guestToken = (await sessions.issue(guest.id)).token;
    strangerToken = (await sessions.issue(stranger.id)).token;

    const res = await http()
      .post('/api/v1/projects')
      .set(auth(ownerToken))
      .send({ name: `invite-${stamp}` })
      .expect(201);
    projectId = res.body.id as string;
  }, 30_000);

  afterAll(async () => {
    for (const user of [owner, guest, stranger]) {
      if (!user) continue;
      await ds.query(
        `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
        [user.id],
      );
      await ds.getRepository(Session).delete({ user_id: user.id });
      await ds.getRepository(User).delete({ id: user.id });
    }
    await app.close();
  });

  describe('누가 만들 수 있는가', () => {
    it('owner는 링크를 만들고 원문 토큰을 한 번 받는다', async () => {
      const invite = await issueInvite();

      expect(invite.token).toMatch(/^inv_/);
      expect(invite.token.length).toBeGreaterThan(20);
      expect(Date.parse(invite.expires_at)).toBeGreaterThan(Date.now());
    });

    it('목록에는 원문 토큰이 나오지 않는다 — DB에는 해시만 있다', async () => {
      const invite = await issueInvite();

      const res = await http()
        .get(`/api/v1/projects/${projectId}/invites`)
        .set(auth(ownerToken))
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain(invite.token);
      const found = (res.body.items as { id: string; active: boolean }[]).find(
        (i) => i.id === invite.id,
      );
      expect(found?.active).toBe(true);

      const row = await ds.getRepository(ProjectInvite).findOneByOrFail({ id: invite.id });
      expect(row.token_hash).not.toContain(invite.token);
    });

    it('멤버지만 owner가 아니면 만들 수 없다 — 한 번 들어온 사람이 다음 사람을 부르면 안 된다', async () => {
      const invite = await issueInvite();
      await http()
        .post('/api/v1/invites/accept')
        .set(auth(guestToken))
        .send({ token: invite.token })
        .expect(200);

      // guest는 이제 멤버다. 그래도 초대는 못 만든다.
      await http()
        .post(`/api/v1/projects/${projectId}/invites`)
        .set(auth(guestToken))
        .send({})
        .expect(404);

      // 목록도 못 본다 — 누가 초대됐는지가 새면 안 된다.
      await http().get(`/api/v1/projects/${projectId}/invites`).set(auth(guestToken)).expect(404);
    });

    it('남은 프로젝트의 존재조차 알 수 없다 (403이 아니라 404)', async () => {
      await http()
        .post(`/api/v1/projects/${projectId}/invites`)
        .set(auth(strangerToken))
        .send({})
        .expect(404);
    });

    it('유효기간 범위를 벗어나면 400이다', async () => {
      await http()
        .post(`/api/v1/projects/${projectId}/invites`)
        .set(auth(ownerToken))
        .send({ ttl_days: 0 })
        .expect(400);
      await http()
        .post(`/api/v1/projects/${projectId}/invites`)
        .set(auth(ownerToken))
        .send({ ttl_days: 31 })
        .expect(400);
    });
  });

  describe('수락', () => {
    it('링크를 보면 어느 프로젝트에 누가 불렀는지 알 수 있다', async () => {
      const invite = await issueInvite();

      const res = await http()
        .post('/api/v1/invites/lookup')
        .set(auth(strangerToken))
        .send({ token: invite.token })
        .expect(200);

      expect(res.body.project_id).toBe(projectId);
      expect(res.body.invited_by).toBe(owner.github_login);
      expect(res.body.already_member).toBe(false);
    });

    it('수락하면 멤버가 된다 — 역할은 항상 member다', async () => {
      const invite = await issueInvite();

      const res = await http()
        .post('/api/v1/invites/accept')
        .set(auth(strangerToken))
        .send({ token: invite.token })
        .expect(200);

      expect(res.body).toEqual({ project_id: projectId, joined: true });

      const list = await http()
        .get(`/api/v1/projects/${projectId}/members`)
        .set(auth(ownerToken))
        .expect(200);
      const me = (list.body.items as { github_login: string; role: string }[]).find(
        (m) => m.github_login === stranger.github_login,
      );
      expect(me?.role).toBe('member');
    });

    it('두 번 눌러도 안전하다 — 에러가 아니라 joined:false이고 사용 횟수도 안 오른다', async () => {
      const invite = await issueInvite();

      await http()
        .post('/api/v1/invites/accept')
        .set(auth(guestToken))
        .send({ token: invite.token })
        .expect(200);
      const before = await ds.getRepository(ProjectInvite).findOneByOrFail({ id: invite.id });

      const second = await http()
        .post('/api/v1/invites/accept')
        .set(auth(guestToken))
        .send({ token: invite.token })
        .expect(200);

      expect(second.body.joined).toBe(false);
      const after = await ds.getRepository(ProjectInvite).findOneByOrFail({ id: invite.id });
      // 그 숫자의 뜻은 "몇 명이 들어왔나"이지 "몇 번 눌렸나"가 아니다.
      expect(after.accepted_count).toBe(before.accepted_count);
    });

    it('멤버 수가 실제로 는다', async () => {
      const before = await members();
      const invite = await issueInvite();
      await http()
        .post('/api/v1/invites/accept')
        .set(auth(strangerToken))
        .send({ token: invite.token })
        .expect(200);

      expect(await members()).toContain(stranger.github_login);
      expect((await members()).length).toBeGreaterThanOrEqual(before.length);
    });
  });

  describe('못 쓰게 되는 경우 — 전부 같은 404다', () => {
    it('없는 토큰', async () => {
      await http()
        .post('/api/v1/invites/accept')
        .set(auth(strangerToken))
        .send({ token: 'inv_nope' })
        .expect(404);
    });

    it('폐기된 링크', async () => {
      const invite = await issueInvite();
      await http().delete(`/api/v1/invites/${invite.id}`).set(auth(ownerToken)).expect(204);

      await http()
        .post('/api/v1/invites/lookup')
        .set(auth(strangerToken))
        .send({ token: invite.token })
        .expect(404);
    });

    it('만료된 링크', async () => {
      const invite = await issueInvite();
      // created_at도 함께 뒤로 민다. expires_at만 과거로 보내면
      // chk_..._expiry_after_creation에 걸린다 — 그 제약이 맞다(만들 때부터 만료된 링크는
      // 데이터가 아니라 버그다). 여기서 흉내 내려는 것은 "이틀 전에 만든 하루짜리 링크"다.
      await ds.query(
        `UPDATE project_invites
            SET created_at = now() - interval '2 days',
                expires_at = now() - interval '1 day'
          WHERE id = $1`,
        [invite.id],
      );

      await http()
        .post('/api/v1/invites/accept')
        .set(auth(strangerToken))
        .send({ token: invite.token })
        .expect(404);
    });

    it('인증 없이는 수락할 수 없다 — 링크만으로 계정 없이 들어오지 못한다', async () => {
      const invite = await issueInvite();
      await http().post('/api/v1/invites/accept').send({ token: invite.token }).expect(401);
    });
  });

  describe('폐기', () => {
    it('owner가 아니면 폐기할 수 없다', async () => {
      const invite = await issueInvite();
      await http().delete(`/api/v1/invites/${invite.id}`).set(auth(guestToken)).expect(404);
    });

    it('두 번 폐기해도 성공이다 — 목적은 이미 이뤄졌다', async () => {
      const invite = await issueInvite();
      await http().delete(`/api/v1/invites/${invite.id}`).set(auth(ownerToken)).expect(204);
      await http().delete(`/api/v1/invites/${invite.id}`).set(auth(ownerToken)).expect(204);
    });

    it('폐기하면 목록에서 active가 false다', async () => {
      const invite = await issueInvite();
      await http().delete(`/api/v1/invites/${invite.id}`).set(auth(ownerToken)).expect(204);

      const res = await http()
        .get(`/api/v1/projects/${projectId}/invites`)
        .set(auth(ownerToken))
        .expect(200);
      const found = (res.body.items as { id: string; active: boolean }[]).find(
        (i) => i.id === invite.id,
      );
      expect(found?.active).toBe(false);
    });
  });
});
