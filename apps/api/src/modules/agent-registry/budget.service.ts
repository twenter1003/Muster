import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, AgentRun, ProjectBudget } from '../../database/entities';
import {
  DomainEvent,
  type BudgetThresholdExceededEvent,
} from '../../common/events/domain-events';
import type { PutBudgetDto } from './dto/put-budget.dto';

export interface BudgetUsage {
  token_limit: string | null;
  cost_limit: string | null;
  alert_threshold_pct: string;
  used_tokens: string;
  used_cost: string;
  /** 한도가 없으면 null — 0%가 아니다. "한도 없음"과 "안 썼음"은 다르다. */
  token_usage_pct: number | null;
  cost_usage_pct: number | null;
  updated_at: string | null;
}

/** 기본 예산. 레코드가 없어도 조회가 되어야 대시보드가 빈 화면을 안 만든다. */
const DEFAULT_THRESHOLD_PCT = '80';

@Injectable()
export class BudgetService {
  constructor(
    @InjectRepository(ProjectBudget) private readonly budgets: Repository<ProjectBudget>,
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * 설계서 Part 4 §6 — 예산 설정 + 현재 사용률.
   * 사용량은 그 프로젝트 전체 AGENT_RUNS 집계다 (에이전트 단위가 아니라 프로젝트 단위).
   */
  async get(projectId: string): Promise<BudgetUsage> {
    const [budget, used] = await Promise.all([
      this.budgets.findOneBy({ project_id: projectId }),
      this.sumUsage(projectId),
    ]);

    return {
      token_limit: budget?.token_limit ?? null,
      cost_limit: budget?.cost_limit ?? null,
      alert_threshold_pct: budget?.alert_threshold_pct ?? DEFAULT_THRESHOLD_PCT,
      used_tokens: used.tokens,
      used_cost: used.cost,
      token_usage_pct: pct(used.tokens, budget?.token_limit ?? null),
      cost_usage_pct: pct(used.cost, budget?.cost_limit ?? null),
      updated_at: budget?.updated_at.toISOString() ?? null,
    };
  }

  /**
   * 설계서 Part 4 §6 — 예산 설정. 프로젝트당 하나이므로 없으면 만들고 있으면 교체한다.
   *
   * PUT이므로 전체 교체다: 생략한 한도는 "한도 없음"이 된다. 임계치만 기본값(80)으로
   * 되돌아가는데, 한도가 없으면 임계치도 의미가 없으므로 문제되지 않는다.
   */
  async put(projectId: string, dto: PutBudgetDto): Promise<BudgetUsage> {
    const existing = await this.budgets.findOneBy({ project_id: projectId });
    const budget = existing ?? this.budgets.create({ project_id: projectId });

    budget.token_limit = dto.token_limit ?? null;
    budget.cost_limit = dto.cost_limit ?? null;
    budget.alert_threshold_pct = String(dto.alert_threshold_pct ?? DEFAULT_THRESHOLD_PCT);

    await this.budgets.save(budget);
    return this.get(projectId);
  }

  /**
   * 실행 종료 기록 후 호출된다 (설계서 Part 4 §6 — "갱신 시 사용률을 재계산하고
   * 임계치 초과 시 알림").
   *
   * `before`는 이 실행을 반영하기 **전** 사용량이다. 임계치를 **넘어서는 순간**에만
   * 발행한다 — 매번 발행하면 한도 근처에서 실행할 때마다 같은 알림이 반복된다.
   */
  async recalculateAndAlert(projectId: string, before: { tokens: string; cost: string }) {
    const budget = await this.budgets.findOneBy({ project_id: projectId });
    if (!budget) return; // 예산을 안 정했으면 알릴 것도 없다.

    const after = await this.sumUsage(projectId);
    const threshold = Number(budget.alert_threshold_pct);

    this.alertIfCrossed(projectId, 'tokens', before.tokens, after.tokens, budget.token_limit, threshold);
    this.alertIfCrossed(projectId, 'cost', before.cost, after.cost, budget.cost_limit, threshold);
  }

  private alertIfCrossed(
    projectId: string,
    metric: 'tokens' | 'cost',
    beforeUsed: string,
    afterUsed: string,
    limit: string | null,
    thresholdPct: number,
  ) {
    if (!limit) return;

    const beforePct = pct(beforeUsed, limit);
    const afterPct = pct(afterUsed, limit);
    if (afterPct === null || afterPct < thresholdPct) return;
    if (beforePct !== null && beforePct >= thresholdPct) return; // 이미 넘어 있었다.

    const payload: BudgetThresholdExceededEvent = {
      project_id: projectId,
      metric,
      used: afterUsed,
      limit,
      usage_pct: afterPct,
      threshold_pct: thresholdPct,
      occurred_at: new Date().toISOString(),
    };
    this.events.emit(DomainEvent.BUDGET_THRESHOLD_EXCEEDED, payload);
  }

  /**
   * 프로젝트 전체 사용량. 합계는 JS가 아니라 SQL의 SUM()으로 낸다 —
   * numeric을 JS number로 옮기면 금액에 반올림 오차가 생긴다.
   */
  async sumUsage(projectId: string): Promise<{ tokens: string; cost: string }> {
    const row = await this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .select('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost')
      .getRawOne<{ tokens: string; cost: string }>();

    return { tokens: String(row?.tokens ?? '0'), cost: String(row?.cost ?? '0') };
  }
}

/**
 * 사용률(%). 한도가 없거나 0이면 null이다 — 0으로 나눈 Infinity를 백분율이라 부를 수 없고,
 * "한도 없음"은 0%와 다르다.
 *
 * 여기서만 Number로 바꾼다. 비교용 표시값이고 저장·합산에는 쓰지 않는다.
 */
function pct(used: string, limit: string | null): number | null {
  if (!limit) return null;
  const l = Number(limit);
  if (!Number.isFinite(l) || l <= 0) return null;
  return Math.round((Number(used) / l) * 10000) / 100;
}
