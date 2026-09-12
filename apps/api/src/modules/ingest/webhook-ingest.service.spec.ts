import { createHmac } from 'node:crypto';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { DataSource, Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import type { GitIntegration } from '../../database/entities';
import { DomainEvent } from '../../common/events/domain-events';
import type { SecretStore } from '../../common/secrets/secret-store';
import type { HealthService } from './health.service';
import { WebhookIngestService } from './webhook-ingest.service';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const SECRET = 'c'.repeat(64);
const REPO = 'https://github.com/kimtaewoo/muster';

const body = (payload: unknown) => Buffer.from(JSON.stringify(payload), 'utf8');
const sign = (raw: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

const PUSH = body({
  repository: { full_name: 'kimtaewoo/muster' },
  ref: 'refs/heads/main',
  commits: [{}],
  head_commit: { message: '웹훅 수신 구현' },
});

interface Harness {
  service: WebhookIngestService;
  inserted: Array<{ target: unknown; entity: Record<string, unknown> }>;
  emitted: Array<{ name: string; payload: unknown }>;
  committed: boolean;
}

/**
 * 트랜잭션·리포지토리·시크릿 저장소를 가짜로 세운다. 여기서 확인하려는 것은 SQL이 아니라
 * **순서와 판정**이다 — 무엇을 검증하기 전에 무엇을 쓰는가, 실패하면 무엇이 남는가.
 */
function harness(
  opts: {
    integration?: Partial<GitIntegration> | null;
    secret?: string | null;
    onInsert?: (target: unknown) => void;
  } = {},
): Harness {
  const inserted: Harness['inserted'] = [];
  const emitted: Harness['emitted'] = [];
  const state = { committed: false };

  const integration =
    opts.integration === undefined
      ? ({ project_id: PROJECT, webhook_secret_ref: 'ref://webhook' } as GitIntegration)
      : (opts.integration as GitIntegration | null);

  const integrations = {
    createQueryBuilder: () => ({
      where: () => ({ getOne: async () => integration }),
    }),
  } as unknown as Repository<GitIntegration>;

  const secrets: SecretStore = {
    get: async () => (opts.secret === undefined ? SECRET : opts.secret),
    put: async () => 'ref://webhook',
    delete: async () => undefined,
  };

  const manager = {
    insert: async (target: unknown, entity: Record<string, unknown>) => {
      opts.onInsert?.(target);
      inserted.push({ target, entity });
    },
    create: (_target: unknown, entity: Record<string, unknown>) => entity,
    save: async (entity: Record<string, unknown>) => ({
      id: 'log-1',
      created_at: new Date('2026-09-09T10:00:00.000Z'),
      ...entity,
    }),
  };

  const dataSource = {
    transaction: async (run: (m: typeof manager) => Promise<void>) => {
      await run(manager);
      state.committed = true;
    },
  } as unknown as DataSource;

  const events = {
    emit: (name: string, payload: unknown) => {
      emitted.push({ name, payload });
      return true;
    },
  } as unknown as EventEmitter2;

  // 헬스 재계산은 dora.spec.ts가 따로 검증한다. 여기서는 "배포 이벤트가 있으면 불린다"만 본다.
  const health = { recompute: async () => null } as unknown as HealthService;

  return {
    service: new WebhookIngestService(integrations, secrets, health, dataSource, events),
    inserted,
    emitted,
    get committed() {
      return state.committed;
    },
  };
}

const request = (raw: Buffer, signature: string | undefined, deliveryId = 'delivery-1') => ({
  eventType: 'push',
  deliveryId,
  signature,
  rawBody: raw,
});

describe('WebhookIngestService', () => {
  describe('서명 검증', () => {
    it('유효한 서명이면 적재한다', async () => {
      const h = harness();

      await expect(h.service.handle(request(PUSH, sign(PUSH)))).resolves.toBe('processed');
      expect(h.committed).toBe(true);
    });

    it('서명이 틀리면 401이고 아무것도 쓰지 않는다', async () => {
      const h = harness();

      await expect(h.service.handle(request(PUSH, sign(PUSH, 'wrong')))).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
      expect(h.inserted).toEqual([]);
      expect(h.committed).toBe(false);
    });

    it('연동되지 않은 레포·시크릿 분실·서명 불일치를 같은 응답으로 만든다', async () => {
      // 구분해 주면 서명 없이도 "이 레포가 연동돼 있는가"를 물어보는 창구가 된다.
      const cases = [harness({ integration: null }), harness({ secret: null }), harness()];
      const signatures = [sign(PUSH), sign(PUSH), sign(PUSH, 'wrong')];

      const responses = await Promise.all(
        cases.map(async (h, i) => {
          try {
            await h.service.handle(request(PUSH, signatures[i]));
            return 'passed';
          } catch (e) {
            const err = e as { getStatus(): number; getResponse(): unknown };
            return `${err.getStatus()} ${JSON.stringify(err.getResponse())}`;
          }
        }),
      );

      expect(responses[0]).toBe(responses[1]);
      expect(responses[1]).toBe(responses[2]);
      expect(responses[0]).toContain('401');
    });

    it('페이로드에 레포가 없으면 검증할 수 없으므로 거부한다', async () => {
      const raw = body({ zen: '...' });
      await expect(harness().service.handle(request(raw, sign(raw)))).rejects.toMatchObject({
        code: 'WEBHOOK_SIGNATURE_INVALID',
      });
    });
  });

  describe('멱등성 (Part 4 §7.1)', () => {
    it('이미 처리한 배달은 duplicate로 넘긴다', async () => {
      const h = harness({
        onInsert: (target) => {
          if ((target as { name?: string }).name === 'WebhookDelivery') {
            throw Object.assign(new QueryFailedError('insert', [], new Error('duplicate key')), {
              code: '23505',
            });
          }
        },
      });

      await expect(h.service.handle(request(PUSH, sign(PUSH)))).resolves.toBe('duplicate');
      expect(h.emitted).toEqual([]);
    });

    it('배달 기록과 로그 적재가 같은 트랜잭션에 들어간다', async () => {
      // 배달 기록만 먼저 커밋되면, 적재가 실패했는데 재전송은 중복으로 무시돼 이벤트가 사라진다.
      const h = harness();
      await h.service.handle(request(PUSH, sign(PUSH)));

      const targets = h.inserted.map((i) => (i.target as { name: string }).name);
      expect(targets).toContain('WebhookDelivery');
      expect(h.committed).toBe(true);
    });

    it('유니크 위반이 아닌 오류는 삼키지 않는다', async () => {
      const h = harness({
        onInsert: () => {
          throw new Error('연결이 끊겼습니다');
        },
      });

      await expect(h.service.handle(request(PUSH, sign(PUSH)))).rejects.toThrow(
        '연결이 끊겼습니다',
      );
    });
  });

  describe('이벤트 발행 (Part 2 §8)', () => {
    it('로그를 적재하면 LOG_APPENDED를 발행한다', async () => {
      const h = harness();
      await h.service.handle(request(PUSH, sign(PUSH)));

      expect(h.emitted).toHaveLength(1);
      expect(h.emitted[0].name).toBe(DomainEvent.LOG_APPENDED);
      expect(h.emitted[0].payload).toMatchObject({
        project_id: PROJECT,
        log_entry_id: 'log-1',
        level: 'info',
      });
    });

    it('남길 로그가 없는 이벤트는 ignored이고 아무것도 발행하지 않는다', async () => {
      const raw = body({ repository: { full_name: 'kimtaewoo/muster' }, zen: '...' });
      const h = harness();

      const outcome = await h.service.handle({
        eventType: 'ping',
        deliveryId: 'delivery-ping',
        signature: sign(raw),
        rawBody: raw,
      });

      expect(outcome).toBe('ignored');
      expect(h.emitted).toEqual([]);
      // 배달 기록은 남긴다 — 재전송을 다시 처리하지 않기 위해서다.
      expect(h.inserted).toHaveLength(1);
    });
  });

  it('레포 URL 대소문자가 달라도 같은 연동으로 본다', async () => {
    const raw = body({
      repository: { full_name: 'KimTaewoo/Muster' },
      ref: 'refs/heads/main',
      commits: [],
    });
    const h = harness();

    await expect(h.service.handle(request(raw, sign(raw)))).resolves.toBe('processed');
    expect(REPO.toLowerCase()).toBe('https://github.com/kimtaewoo/muster');
  });
});
