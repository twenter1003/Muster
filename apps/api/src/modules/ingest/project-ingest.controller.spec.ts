import type { Request } from 'express';
import type { LogEntry } from '../../database/entities';
import { ProjectIngestController } from './project-ingest.controller';
import type { LogsService } from './logs.service';
import type { HealthService } from './health.service';
import type { TimelineService } from './timeline.service';
import type { AppendLogDto } from './dto/append-log.dto';

const MINE = '11111111-1111-4111-8111-111111111111';
const YOURS = '22222222-2222-4222-8222-222222222222';

const DTO: AppendLogDto = { level: 'info', message: '테스트' };

const controllerWith = (append = jest.fn(async () => entry())) => ({
  controller: new ProjectIngestController(
    { append } as unknown as LogsService,
    {} as HealthService,
    {} as TimelineService,
  ),
  append,
});

const entry = () =>
  ({
    id: 'log-1',
    project_id: MINE,
    agent_id: null,
    level: 'info',
    message: '테스트',
    created_at: new Date('2026-09-12T00:00:00.000Z'),
  }) as LogEntry;

const req = (apiKeyProjectId: string | undefined) => ({ apiKeyProjectId }) as Request;

/**
 * ApiKeyGuard는 "이 키가 유효한가"까지만 답한다. 키가 **어느 프로젝트 것인지**와 경로가
 * 맞는지는 컨트롤러가 본다. 이 검사가 빠지면 유효한 키 하나로 모든 프로젝트에 로그를
 * 밀어넣을 수 있다 — 가드를 통과했으니 다른 방어선도 없다.
 */
describe('POST /projects/:id/logs — 키 스코프', () => {
  it('키의 프로젝트와 경로가 같으면 적재한다', async () => {
    const { controller, append } = controllerWith();

    await expect(controller.append(req(MINE), MINE, DTO)).resolves.toMatchObject({ id: 'log-1' });
    expect(append).toHaveBeenCalledWith(MINE, DTO);
  });

  it('다른 프로젝트의 키면 404이고 적재하지 않는다', async () => {
    const { controller, append } = controllerWith();

    await expect(controller.append(req(YOURS), MINE, DTO)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(append).not.toHaveBeenCalled();
  });

  it('403이 아니라 404를 준다 — 남의 프로젝트가 존재하는지 알려주지 않는다', async () => {
    const { controller } = controllerWith();

    const error = await controller.append(req(YOURS), MINE, DTO).catch((e: unknown) => e);
    const { getStatus, getResponse } = error as { getStatus(): number; getResponse(): unknown };

    expect(getStatus.call(error)).toBe(404);
    expect(getResponse.call(error)).toEqual({
      error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.' },
    });
  });

  it('가드가 프로젝트를 실어 주지 않았으면(가드 누락) 막는다', async () => {
    // 라우트에서 @UseGuards를 빼면 apiKeyProjectId가 undefined가 된다.
    // 그때 통과시키면 인증이 통째로 사라진 채로 열린다.
    const { controller, append } = controllerWith();

    await expect(controller.append(req(undefined), MINE, DTO)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(append).not.toHaveBeenCalled();
  });
});
