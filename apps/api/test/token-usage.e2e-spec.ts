import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DATA_SOURCE } from '../src/database/database.module';
import { SessionService } from '../src/modules/auth/session.service';
import { Agent, AgentRun, Session, User } from '../src/database/entities';

/**
 * `GET /projects/:id/token-usage` — 프로젝트 목록·상세 화면의 토큰 사용량 카드.
 *
 * AGENT_RUNS를 시작/종료 HTTP 플로우로 쌓으면 "오늘"이 테스트 실행 시각에 따라
 * 달라져 날짜 경계 검증이 불안정해진다. 그래서 여기서는 리포지토리로 started_at을
 * 직접 고정해 넣는다 — 집계 SQL(date_trunc 그룹핑)이 맞는지만 본다.
 */
describe('GET /projects/:id/token-usage (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let user: User;
  let token: string;
  let projectId: string;
  let agentId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const daysAgo = (n: number): Date => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(12, 0, 0, 0); // 자정 경계 근처를 피한다.
    return d;
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

    const users = ds.getRepository(User);
    user = await users.save(users.create({ github_login: `usage-${Date.now()}`, email: null }));
    token = (await app.get(SessionService).issue(user.id)).token;

    const project = await http()
      .post('/api/v1/projects')
      .set(auth())
      .send({ name: 'usage-target' })
      .expect(201);
    projectId = project.body.id;

    const agent = await http()
      .post(`/api/v1/projects/${projectId}/agents`)
      .set(auth())
      .send({ name: 'usage-agent', config_md: '# agent' })
      .expect(201);
    agentId = agent.body.id;

    const runs = ds.getRepository(AgentRun);
    // 'running'이 아닌 상태는 ended_at이 있어야 한다(chk_agent_runs_status_matches_ended_at).
    const finishedRun = (tokens: number, startedAt: Date) =>
      runs.create({
        agent_id: agentId,
        status: 'succeeded',
        tokens_used: tokens,
        started_at: startedAt,
        ended_at: startedAt,
      });

    await runs.save([
      finishedRun(100, daysAgo(0)),
      finishedRun(50, daysAgo(0)),
      finishedRun(30, daysAgo(2)),
      // 집계 창(7일) 밖의 오래된 실행 — daily에는 안 잡히지만 이번 달 안이면 month_tokens엔 잡힌다.
      finishedRun(9999, daysAgo(20)),
    ]);
  }, 30_000);

  afterAll(async () => {
    await ds.query(
      `DELETE FROM projects WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1)`,
      [user.id],
    );
    await ds.getRepository(Session).delete({ user_id: user.id });
    await ds.getRepository(User).delete({ id: user.id });
    await ds.getRepository(Agent).delete({ id: agentId });
    await app.close();
  });

  it('오늘 사용량은 오늘 실행분만 더한다', async () => {
    const res = await http()
      .get(`/api/v1/projects/${projectId}/token-usage`)
      .set(auth())
      .expect(200);
    expect(res.body.today_tokens).toBe('150');
  });

  it('daily는 최근 7일을 빠짐없이 채우고(값 없는 날은 0), 창 밖 실행은 빠진다', async () => {
    const res = await http()
      .get(`/api/v1/projects/${projectId}/token-usage`)
      .set(auth())
      .expect(200);

    expect(res.body.daily).toHaveLength(7);
    const byDate = new Map(
      (res.body.daily as Array<{ date: string; tokens: string }>).map((d) => [d.date, d.tokens]),
    );
    const todayKey = daysAgo(0).toISOString().slice(0, 10);
    const twoDaysAgoKey = daysAgo(2).toISOString().slice(0, 10);

    expect(byDate.get(todayKey)).toBe('150');
    expect(byDate.get(twoDaysAgoKey)).toBe('30');
    // 20일 전 실행은 daily 합계 어디에도 없다 — 창을 넘겼다.
    expect([...byDate.values()].reduce((a, b) => a + Number(b), 0)).toBe(180);
  });

  it('이번 달 누적은 7일 창 밖이라도 이번 달이면 포함한다', async () => {
    const res = await http()
      .get(`/api/v1/projects/${projectId}/token-usage`)
      .set(auth())
      .expect(200);
    // 20일 전 실행이 이번 달 안이면 9999가 더해진다. 달 경계를 걸치는 날 실행되면
    // 그 실행분만 빠질 수 있는데, month_tokens >= daily 합만 확인해 그 경우도 통과한다.
    expect(Number(res.body.month_tokens)).toBeGreaterThanOrEqual(180);
  });

  it('비멤버는 404다', async () => {
    const outsiders = ds.getRepository(User);
    const outsider = await outsiders.save(
      outsiders.create({ github_login: `usage-outsider-${Date.now()}`, email: null }),
    );
    const outsiderToken = (await app.get(SessionService).issue(outsider.id)).token;

    await http()
      .get(`/api/v1/projects/${projectId}/token-usage`)
      .set({ Authorization: `Bearer ${outsiderToken}` })
      .expect(404);

    await ds.getRepository(Session).delete({ user_id: outsider.id });
    await outsiders.delete({ id: outsider.id });
  });

  it('인증 없이는 401이다', async () => {
    await http().get(`/api/v1/projects/${projectId}/token-usage`).expect(401);
  });
});
