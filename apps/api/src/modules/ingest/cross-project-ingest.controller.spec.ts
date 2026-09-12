import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import type { HealthSnapshot, LogEntry } from '../../database/entities';
import { CrossProjectIngestController } from './cross-project-ingest.controller';
import type { LogsService } from './logs.service';
import type { HealthService } from './health.service';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

const USER = { id: 'user-1' } as AuthenticatedUser;

const log = (id: string, projectId: string) =>
  ({
    id,
    project_id: projectId,
    agent_id: null,
    level: 'error',
    message: '실패',
    created_at: new Date('2026-09-12T00:00:00.000Z'),
  }) as LogEntry;

const snapshot = (id: string, projectId: string) =>
  ({
    id,
    project_id: projectId,
    deploy_freq_score: 4,
    lead_time_score: null,
    change_fail_score: 3,
    mttr_score: null,
    composite_score: '3.50',
    measured_at: new Date('2026-09-12T00:00:00.000Z'),
  }) as HealthSnapshot;

const names = new Map([
  [P1, '프로젝트 하나'],
  [P2, '프로젝트 둘'],
]);

/**
 * 여기서 볼 값어치가 있는 것은 스코프 질의가 이미 가져온 프로젝트 이름이 행마다 제대로
 * 붙는가다. 스코프 자체(누구의 행이 보이는가)는 DB 질의라 e2e가 검증한다.
 */
describe('GET /logs, /health-snapshots — 프로젝트 이름 결합', () => {
  it('행마다 자기 프로젝트 이름이 붙는다', async () => {
    const controller = new CrossProjectIngestController(
      {
        listForMember: jest.fn(async () => ({
          items: [log('a', P1), log('b', P2)],
          next_cursor: null,
          project_names: names,
        })),
      } as unknown as LogsService,
      {} as HealthService,
    );

    const page = await controller.listLogs(USER, { level: 'error' });

    expect(page.items.map((i) => i.project_name)).toEqual(['프로젝트 하나', '프로젝트 둘']);
    expect(page.items[0].message).toBe('실패');
  });

  it('composite_score는 문자열로, DORA 하위 점수는 null을 그대로 내보낸다', async () => {
    const controller = new CrossProjectIngestController(
      {} as LogsService,
      {
        listForMember: jest.fn(async () => ({
          items: [snapshot('h1', P2)],
          next_cursor: null,
          project_names: names,
        })),
      } as unknown as HealthService,
    );

    const page = await controller.listHealth(USER, {});

    expect(page.items[0]).toMatchObject({
      project_name: '프로젝트 둘',
      // numeric 컬럼이라 문자열이다 — 숫자로 바꾸면 정밀도를 잃는다.
      composite_score: '3.50',
      lead_time_score: null,
      mttr_score: null,
      deploy_freq_score: 4,
    });
  });

  it('멤버 프로젝트가 없어 빈 페이지가 와도 이름 결합에서 터지지 않는다', async () => {
    const controller = new CrossProjectIngestController(
      {} as LogsService,
      {
        listForMember: jest.fn(async () => ({
          items: [],
          next_cursor: null,
          project_names: new Map(),
        })),
      } as unknown as HealthService,
    );

    await expect(controller.listHealth(USER, {})).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
  });
});
