import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, AgentRun, ProjectBudget } from '../../database/entities';
import { DomainEvent, type BudgetThresholdExceededEvent } from '../../common/events/domain-events';
import type { PutBudgetDto } from './dto/put-budget.dto';

import {
  assessSessionWaste,
  computeWasteInsight,
  type SessionWasteAssessment,
  type WasteInsightSummary,
} from './token-waste';

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

export interface SessionRunView {
  id: string;
  agent_name: string;
  tokens_used: number;
  cost: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  waste: SessionWasteAssessment;
}

/** 프로젝트 상세·목록 화면의 "토큰 사용량" 카드가 쓰는 하루 단위 집계 및 낭비 진단. */
export interface UsageBreakdown {
  today_tokens: string;
  month_tokens: string;
  total_tokens?: string;
  /** 오래된 날짜부터 오늘까지, 값이 없는 날도 '0'으로 채워서 스파크라인이 끊기지 않게 한다. */
  daily: Array<{ date: string; tokens: string }>;
  waste_insight?: WasteInsightSummary;
  recent_runs?: SessionRunView[];
}

const DAILY_WINDOW_DAYS = 7;

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

    this.alertIfCrossed(
      projectId,
      'tokens',
      before.tokens,
      after.tokens,
      budget.token_limit,
      threshold,
    );
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
   * 오늘 사용량·이번 달 누적·최근 며칠간의 하루 단위 사용량.
   * 목록 카드는 today_tokens만, 상세 화면은 daily까지 써서 스파크라인을 그린다.
   *
   * 날짜 경계는 UTC 기준이다(date_trunc의 기본 세션 타임존). 사용자별 시간대를 반영하지
   * 않는 근사치이지만, "오늘 얼마나 썼는지" 감을 주는 용도라 이 정도 오차는 감수한다.
   */
  async dailyUsage(projectId: string, agentName?: string): Promise<UsageBreakdown> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (DAILY_WINDOW_DAYS - 1));
    since.setUTCHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    let rowsQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .andWhere('r.started_at >= :since', { since })
      .select("date_trunc('day', r.started_at)", 'day')
      .addSelect('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .groupBy('day');

    let monthQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .andWhere('r.started_at >= :monthStart', { monthStart })
      .select('COALESCE(SUM(r.tokens_used), 0)', 'tokens');

    let totalQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .select('COALESCE(SUM(r.tokens_used), 0)', 'tokens');

    let recentQb = this.runs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.agent', 'a')
      .where('a.project_id = :projectId', { projectId })
      .orderBy('r.started_at', 'DESC')
      .take(10);

    if (agentName && agentName !== 'all') {
      rowsQb = rowsQb.andWhere('a.name = :agentName', { agentName });
      monthQb = monthQb.andWhere('a.name = :agentName', { agentName });
      totalQb = totalQb.andWhere('a.name = :agentName', { agentName });
      recentQb = recentQb.andWhere('a.name = :agentName', { agentName });
    }

    const [rows, monthRow, totalRow, recentRuns] = await Promise.all([
      rowsQb.getRawMany<{ day: Date; tokens: string }>(),
      monthQb.getRawOne<{ tokens: string }>(),
      totalQb.getRawOne<{ tokens: string }>(),
      recentQb.getMany(),
    ]);

    const byDay = new Map(rows.map((r) => [toDateKey(r.day), r.tokens]));
    const daily = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) => {
      const day = new Date(since);
      day.setUTCDate(day.getUTCDate() + i);
      const date = toDateKey(day);
      return { date, tokens: byDay.get(date) ?? '0' };
    });

    const recent_runs: SessionRunView[] = recentRuns.map((r) => ({
      id: r.id,
      agent_name: r.agent?.name ?? 'agent',
      tokens_used: r.tokens_used,
      cost: r.cost,
      status: r.status,
      started_at: r.started_at.toISOString(),
      ended_at: r.ended_at ? r.ended_at.toISOString() : null,
      waste: assessSessionWaste(r.tokens_used),
    }));

    return {
      today_tokens: daily.at(-1)?.tokens ?? '0',
      month_tokens: String(monthRow?.tokens ?? '0'),
      total_tokens: String(totalRow?.tokens ?? '0'),
      daily,
      waste_insight: computeWasteInsight(recentRuns),
      recent_runs,
    };
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

/** raw 쿼리 결과의 날짜를 'YYYY-MM-DD' 키로 정규화한다. pg 드라이버가 Date로 주지 않을 수도 있다. */
function toDateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
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
