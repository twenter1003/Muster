import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { BudgetService } from './budget.service';
import { DomainEvent } from '../../common/events/domain-events';
import type { ProjectBudget } from '../../database/entities';

/** 예산 판정의 결정들을 고정한다. */

const PROJECT = '11111111-1111-4111-8111-111111111111';

const budgetRow = (over: Partial<ProjectBudget> = {}): ProjectBudget =>
  ({
    id: 'b1',
    project_id: PROJECT,
    token_limit: null,
    cost_limit: null,
    alert_threshold_pct: '80',
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }) as ProjectBudget;

const make = (budget: ProjectBudget | null, usage: { tokens: string; cost: string }) => {
  const events = new EventEmitter2();
  const budgets = {
    findOneBy: async () => budget,
    create: (v: Partial<ProjectBudget>) => budgetRow(v),
    save: async (v: ProjectBudget) => v,
  } as unknown as Repository<ProjectBudget>;

  const service = new BudgetService(budgets, {} as never, events);
  // sumUsage는 SQL 집계라 여기서는 대역으로 바꾼다.
  jest.spyOn(service, 'sumUsage').mockResolvedValue(usage);
  return { service, events };
};

describe('BudgetService', () => {
  describe('사용률 계산', () => {
    it('한도가 없으면 사용률은 null이다 — 0%가 아니다', async () => {
      const { service } = make(budgetRow(), { tokens: '5000', cost: '1.23' });

      const usage = await service.get(PROJECT);
      expect(usage.token_usage_pct).toBeNull();
      expect(usage.cost_usage_pct).toBeNull();
      // 한도가 없어도 실제 사용량은 그대로 보인다.
      expect(usage.used_tokens).toBe('5000');
    });

    it('예산 레코드가 없어도 조회는 성공한다', async () => {
      const { service } = make(null, { tokens: '0', cost: '0' });

      const usage = await service.get(PROJECT);
      expect(usage.alert_threshold_pct).toBe('80');
      expect(usage.updated_at).toBeNull();
    });

    it('한도가 0이면 사용률은 null이다 — 0으로 나눈 값을 백분율이라 할 수 없다', async () => {
      const { service } = make(budgetRow({ token_limit: '0' }), { tokens: '10', cost: '0' });

      expect((await service.get(PROJECT)).token_usage_pct).toBeNull();
    });

    it('백분율은 소수 둘째 자리까지 낸다', async () => {
      const { service } = make(budgetRow({ token_limit: '3' }), { tokens: '1', cost: '0' });

      expect((await service.get(PROJECT)).token_usage_pct).toBe(33.33);
    });
  });

  describe('임계치 알림', () => {
    const listen = (events: EventEmitter2) => {
      const seen: unknown[] = [];
      events.on(DomainEvent.BUDGET_THRESHOLD_EXCEEDED, (p) => seen.push(p));
      return seen;
    };

    it('임계치를 넘어서는 순간에 발행한다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '850',
        cost: '0',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '700', cost: '0' });

      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ metric: 'tokens', usage_pct: 85, threshold_pct: 80 });
    });

    it('이미 넘어 있었으면 다시 발행하지 않는다 — 같은 알림이 반복되면 안 된다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '950',
        cost: '0',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '900', cost: '0' });

      expect(seen).toHaveLength(0);
    });

    it('임계치 미만이면 발행하지 않는다', async () => {
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '500',
        cost: '0',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '400', cost: '0' });

      expect(seen).toHaveLength(0);
    });

    it('토큰과 비용이 동시에 넘으면 각각 발행한다', async () => {
      const { service, events } = make(
        budgetRow({ token_limit: '1000', cost_limit: '10' }),
        { tokens: '900', cost: '9' },
      );
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '100', cost: '1' });

      expect(seen).toHaveLength(2);
      expect(seen.map((s) => (s as { metric: string }).metric).sort()).toEqual(['cost', 'tokens']);
    });

    it('예산을 안 정했으면 알리지 않는다', async () => {
      const { service, events } = make(null, { tokens: '999999', cost: '0' });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '0', cost: '0' });

      expect(seen).toHaveLength(0);
    });

    it('한도가 없는 지표는 알림 대상이 아니다', async () => {
      // 토큰 한도만 있고 비용 한도는 없다.
      const { service, events } = make(budgetRow({ token_limit: '1000' }), {
        tokens: '100',
        cost: '99999',
      });
      const seen = listen(events);

      await service.recalculateAndAlert(PROJECT, { tokens: '0', cost: '0' });

      expect(seen).toHaveLength(0);
    });
  });

  describe('PUT — 전체 교체', () => {
    it('생략한 한도는 "한도 없음"이 된다', async () => {
      const existing = budgetRow({ token_limit: '1000', cost_limit: '50' });
      const { service } = make(existing, { tokens: '0', cost: '0' });

      await service.put(PROJECT, { token_limit: '2000' });

      expect(existing.token_limit).toBe('2000');
      expect(existing.cost_limit).toBeNull();
    });

    it('임계치를 생략하면 기본값 80으로 돌아간다', async () => {
      const existing = budgetRow({ alert_threshold_pct: '50' });
      const { service } = make(existing, { tokens: '0', cost: '0' });

      await service.put(PROJECT, {});

      expect(existing.alert_threshold_pct).toBe('80');
    });
  });
});
