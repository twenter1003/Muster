import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, AgentRun } from '../../database/entities';
import {
  computeSessionCacheView,
  computeTokenWasteIntelligence,
  type SessionCacheView,
  type TokenWasteIntelligence,
} from './token-waste';
import { computeBurnRate, type BurnRateStatus } from './burn-rate';
import { ModelPricingService } from './model-pricing.service';
import { LATEST_HOOK_VERSION } from './hook-version';

export interface SessionRunView {
  id: string;
  agent_id: string;
  agent_name: string;
  model?: string;
  tokens_used: number;
  cost: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  cache: SessionCacheView;
  /** 이 실행을 보고한 훅 버전. null이면 이 컬럼이 생기기 전 실행(모름)이다. */
  hook_version: number | null;
}

export type TokenGranularity = 'hour' | 'day' | 'month';

export interface TimeSeriesBucket {
  key: string;
  label: string;
  tokens: string;
  cost: string;
  agent_tokens?: Record<string, string>;
  agent_cost?: Record<string, string>;
}

export interface ModelUsageItem {
  model_name: string;
  display_name: string;
  provider: 'anthropic' | 'google' | 'openai' | 'deepseek' | 'other';
  tokens: string;
  cost: string;
  run_count: number;
  percentage: number;
}

/** 프로젝트 상세·목록 화면의 "토큰 사용량" 카드가 쓰는 다차원 시계열 집계 및 모델 브레이크다운. */
export interface UsageBreakdown {
  today_tokens: string;
  month_tokens: string;
  total_tokens?: string;
  today_cost?: string;
  month_cost?: string;
  total_cost?: string;
  /** 오래된 날짜부터 오늘까지, 값이 없는 날도 '0'으로 채워서 스파크라인이 끊기지 않게 한다. */
  daily: Array<{ date: string; tokens: string; cost?: string }>;
  granularity?: TokenGranularity;
  time_series?: TimeSeriesBucket[];
  agent_series?: Record<string, TimeSeriesBucket[]>;
  available_agents?: string[];
  model_breakdown?: ModelUsageItem[];
  waste_intelligence?: TokenWasteIntelligence;
  burn_rate?: BurnRateStatus;
  recent_runs?: SessionRunView[];
  /** 서버가 아는 최신 훅 버전 — recent_runs[].hook_version과 비교해 "훅이 오래됨" 배너를 띄운다. */
  latest_hook_version?: number;
}

const DAILY_WINDOW_DAYS = 7;

/**
 * 프로젝트의 토큰/비용 시계열 집계(일·시·월 버킷, 모델 브레이크다운)와 실시간 Burn Rate.
 * `budget.service.ts`에서 분리했다 — 예산 한도/알림과는 다른 책임(집계·조회)이라
 * 별도 서비스로 두면 각 파일이 한 가지 이유로만 바뀐다.
 */
@Injectable()
export class UsageTimeseriesService {
  private readonly modelPricing: ModelPricingService;

  constructor(
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    modelPricing?: ModelPricingService,
  ) {
    this.modelPricing = modelPricing ?? new ModelPricingService();
  }

  private readonly resolvePricing = (model?: string, agentName?: string) =>
    this.modelPricing.resolvePricingRates(model, agentName);

  /**
   * 프로젝트 목록·상세 화면의 "토큰 사용량" 카드가 쓰는 다차원 시계열 집계 및 모델 브레이크다운.
   * granularity (hour|day|month) 및 한국(Asia/Seoul) 등 클라이언트 타임존 기준으로 버킷을 계산한다.
   */
  async dailyUsage(
    projectId: string,
    agentName?: string,
    timeZone = 'Asia/Seoul',
    granularity: TokenGranularity = 'day',
  ): Promise<UsageBreakdown> {
    const tz = sanitizeTimeZone(timeZone);
    const gran: TokenGranularity =
      granularity === 'hour' || granularity === 'month' ? granularity : 'day';
    const now = new Date();

    // 1. Time-series bucket specifications
    let timeSeriesBuckets: TimeSeriesBucket[] = [];
    let timeSeriesSince: Date;
    let bucketExpr: string;

    if (gran === 'hour') {
      timeSeriesBuckets = getHourlyBuckets(24, tz);
      timeSeriesSince = new Date(now.getTime() - 25 * 3600 * 1000);
      bucketExpr =
        "to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM-DD HH24') || ':00'";
    } else if (gran === 'month') {
      timeSeriesBuckets = getMonthlyBuckets(6, tz);
      timeSeriesSince = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      bucketExpr = "to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM')";
    } else {
      timeSeriesBuckets = getDailyBuckets(14, tz);
      timeSeriesSince = new Date(now.getTime() - 15 * 24 * 3600 * 1000);
      bucketExpr = "to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM-DD')";
    }

    const currentMonth = getDailyDates(1, tz)[0].slice(0, 7);

    let timeSeriesQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .andWhere('(r.started_at >= :since OR (r.ended_at IS NOT NULL AND r.ended_at >= :since))', {
        since: timeSeriesSince,
        tz,
      })
      .select(bucketExpr, 'bucket')
      .addSelect('a.name', 'agent_name')
      .addSelect('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost')
      .groupBy(`${bucketExpr}, a.name`);

    // 하위 호환을 위한 7일 일별 쿼리
    const dailyDates = getDailyDates(DAILY_WINDOW_DAYS, tz);
    const dailySince = new Date(now.getTime() - (DAILY_WINDOW_DAYS + 1) * 24 * 3600 * 1000);
    let dailyQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .andWhere('(r.started_at >= :since OR (r.ended_at IS NOT NULL AND r.ended_at >= :since))', {
        since: dailySince,
        tz,
      })
      .select("to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM-DD')", 'day')
      .addSelect('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost')
      .groupBy("to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM-DD')");

    let monthQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .andWhere(
        "to_char(COALESCE(r.ended_at, r.started_at) AT TIME ZONE :tz, 'YYYY-MM') = :currentMonth",
        { currentMonth, tz },
      )
      .select('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost');

    let totalQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .select('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost');

    let recentQb = this.runs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.agent', 'a')
      .where('a.project_id = :projectId', { projectId })
      .orderBy('r.started_at', 'DESC')
      .take(10);

    let modelQb = this.runs
      .createQueryBuilder('r')
      .innerJoin(Agent, 'a', 'a.id = r.agent_id')
      .where('a.project_id = :projectId', { projectId })
      .select('a.name', 'agent_name')
      .addSelect('r.model', 'model_code')
      .addSelect('COALESCE(SUM(r.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(r.cost), 0)', 'cost')
      .addSelect('COUNT(r.id)', 'run_count')
      .groupBy('a.name, r.model');

    const filterAgents =
      agentName && agentName !== 'all'
        ? agentName
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    if (filterAgents.length === 1) {
      const singleAgent = filterAgents[0];
      timeSeriesQb = timeSeriesQb.andWhere('a.name = :agentName', { agentName: singleAgent });
      dailyQb = dailyQb.andWhere('a.name = :agentName', { agentName: singleAgent });
      monthQb = monthQb.andWhere('a.name = :agentName', { agentName: singleAgent });
      totalQb = totalQb.andWhere('a.name = :agentName', { agentName: singleAgent });
      recentQb = recentQb.andWhere('a.name = :agentName', { agentName: singleAgent });
      modelQb = modelQb.andWhere('a.name = :agentName', { agentName: singleAgent });
    } else if (filterAgents.length > 1) {
      timeSeriesQb = timeSeriesQb.andWhere('a.name IN (:...agentNames)', {
        agentNames: filterAgents,
      });
      dailyQb = dailyQb.andWhere('a.name IN (:...agentNames)', { agentNames: filterAgents });
      monthQb = monthQb.andWhere('a.name IN (:...agentNames)', { agentNames: filterAgents });
      totalQb = totalQb.andWhere('a.name IN (:...agentNames)', { agentNames: filterAgents });
      recentQb = recentQb.andWhere('a.name IN (:...agentNames)', { agentNames: filterAgents });
      modelQb = modelQb.andWhere('a.name IN (:...agentNames)', { agentNames: filterAgents });
    }

    const [timeSeriesRows, dailyRows, monthRow, totalRow, recentRuns, modelRows, burn_rate] =
      await Promise.all([
        timeSeriesQb.getRawMany<{
          bucket: Date | string;
          agent_name?: string;
          tokens: string;
          cost: string;
        }>(),
        dailyQb.getRawMany<{ day: Date | string; tokens: string; cost: string }>(),
        monthQb.getRawOne<{ tokens: string; cost: string }>(),
        totalQb.getRawOne<{ tokens: string; cost: string }>(),
        recentQb.getMany(),
        modelQb.getRawMany<{
          agent_name: string;
          model_code?: string;
          tokens: string;
          cost: string;
          run_count: string | number;
        }>(),
        this.calculateBurnRate(projectId),
      ]);

    const safeModelRows = modelRows || [];
    const safeTimeSeriesRows = timeSeriesRows || [];

    // available_agents 추출 (modelRows 및 timeSeriesRows에 존재하는 고유 에이전트 목록)
    const availableAgentsSet = new Set<string>();
    for (const r of safeModelRows) {
      if (r.agent_name) availableAgentsSet.add(r.agent_name);
    }
    for (const r of safeTimeSeriesRows) {
      if (r.agent_name) availableAgentsSet.add(r.agent_name);
    }
    const available_agents = Array.from(availableAgentsSet);

    // 에이전트별 버킷 맵: bucketKey -> Map<agent_name, { tokens: string, cost: string }>
    // 및 버킷별 전체 토큰/비용 합산 맵: bucketKey -> { tokens: number, cost: number }
    const agentBucketMap = new Map<string, Map<string, { tokens: string; cost: string }>>();
    const bucketTotalMap = new Map<string, { tokens: number; cost: number }>();

    for (const row of safeTimeSeriesRows) {
      const key = toBucketKey(row.bucket);
      const rowTokens = Number(row.tokens) || 0;
      const rowCost = Number(row.cost) || 0;

      // 버킷 전체 합산
      const currentTotal = bucketTotalMap.get(key) || { tokens: 0, cost: 0 };
      currentTotal.tokens += rowTokens;
      currentTotal.cost += rowCost;
      bucketTotalMap.set(key, currentTotal);

      // 에이전트별 저장
      if (row.agent_name) {
        if (!agentBucketMap.has(key)) {
          agentBucketMap.set(key, new Map());
        }
        agentBucketMap.get(key)!.set(row.agent_name, {
          tokens: String(row.tokens),
          cost: String(row.cost),
        });
      }
    }

    // time_series 버킷 채우기 & 개별 버킷 내 agent_tokens / agent_cost 매핑
    const time_series: TimeSeriesBucket[] = timeSeriesBuckets.map((b) => {
      const totalEntry = bucketTotalMap.get(b.key);
      const agentEntryMap = agentBucketMap.get(b.key);
      const agent_tokens: Record<string, string> = {};
      const agent_cost: Record<string, string> = {};

      if (agentEntryMap) {
        for (const [agent, val] of agentEntryMap.entries()) {
          agent_tokens[agent] = val.tokens;
          agent_cost[agent] = val.cost;
        }
      }

      return {
        key: b.key,
        label: b.label,
        tokens: totalEntry ? String(totalEntry.tokens) : '0',
        cost: totalEntry ? totalEntry.cost.toFixed(4) : '0.0000',
        agent_tokens: Object.keys(agent_tokens).length > 0 ? agent_tokens : undefined,
        agent_cost: Object.keys(agent_cost).length > 0 ? agent_cost : undefined,
      };
    });

    // agent_series 생성: 각 에이전트별 독립 시계열 버킷 리스트
    const agent_series: Record<string, TimeSeriesBucket[]> = {};
    for (const agent of available_agents) {
      agent_series[agent] = timeSeriesBuckets.map((b) => {
        const agentVal = agentBucketMap.get(b.key)?.get(agent);
        return {
          key: b.key,
          label: b.label,
          tokens: agentVal?.tokens ?? '0',
          cost: agentVal?.cost ?? '0.0000',
        };
      });
    }

    // 하위 호환 daily 채우기
    const dailyMap = new Map(
      dailyRows.map((r) => [toDateKey(r.day), { tokens: r.tokens, cost: r.cost }]),
    );
    const daily = dailyDates.map((date) => {
      const entry = dailyMap.get(date);
      return {
        date,
        tokens: entry?.tokens ?? '0',
        cost: entry?.cost ?? '0',
      };
    });

    // model_breakdown 계산
    const totalTokensNum = Number(totalRow?.tokens ?? '0');
    const model_breakdown: ModelUsageItem[] = modelRows.map((row) => {
      // 표시용 모델 코드 — resolvePricing()과 달리 에이전트 이름으로 특정 모델을
      // 추측하지 않는다. 실제 model 값이 없거나 단가표와 안 맞으면 "모름"으로 둔다.
      const modelCode = this.modelPricing.resolveKnownModelCode(row.model_code);
      const provider = resolveProvider(modelCode ?? '', row.agent_name);
      const displayName = modelCode ? resolveDisplayName(modelCode, row.agent_name) : '모름';
      const tokensNum = Number(row.tokens);
      const percentage =
        totalTokensNum > 0 ? Math.round((tokensNum / totalTokensNum) * 1000) / 10 : 0;

      return {
        model_name: modelCode ?? 'unknown',
        display_name: displayName,
        provider,
        tokens: String(row.tokens),
        cost: String(row.cost),
        run_count: Number(row.run_count),
        percentage,
      };
    });
    model_breakdown.sort((a, b) => Number(b.tokens) - Number(a.tokens));

    const recent_runs: SessionRunView[] = recentRuns.map((r) => {
      const startMs = r.started_at.getTime();
      const endMs = (r.ended_at ?? new Date()).getTime();
      const duration_seconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
      return {
        id: r.id,
        agent_id: r.agent_id,
        agent_name: r.agent?.name ?? 'agent',
        model: r.model ?? undefined,
        tokens_used: r.tokens_used,
        cost: r.cost,
        status: r.status,
        started_at: r.started_at.toISOString(),
        ended_at: r.ended_at ? r.ended_at.toISOString() : null,
        duration_seconds,
        hook_version: r.hook_version ?? null,
        cache: computeSessionCacheView(
          {
            id: r.id,
            input_tokens: r.input_tokens,
            cache_read_tokens: r.cache_read_tokens,
            cache_write_tokens: r.cache_write_tokens,
            model: r.model,
            agent_name: r.agent?.name,
          },
          this.resolvePricing,
        ),
      };
    });

    return {
      today_tokens: daily.at(-1)?.tokens ?? '0',
      today_cost: daily.at(-1)?.cost ?? '0',
      month_tokens: String(monthRow?.tokens ?? '0'),
      month_cost: String(monthRow?.cost ?? '0'),
      total_tokens: String(totalRow?.tokens ?? '0'),
      total_cost: String(totalRow?.cost ?? '0'),
      daily,
      granularity: gran,
      time_series,
      agent_series,
      available_agents,
      model_breakdown,
      waste_intelligence: computeTokenWasteIntelligence(
        recentRuns.map((r) => ({
          id: r.id,
          cost: r.cost,
          input_tokens: r.input_tokens,
          cache_read_tokens: r.cache_read_tokens,
          cache_write_tokens: r.cache_write_tokens,
          model: r.model,
          agent_name: r.agent?.name,
        })),
        this.resolvePricing,
      ),
      burn_rate,
      recent_runs,
      latest_hook_version: LATEST_HOOK_VERSION,
    };
  }

  /**
   * 최근 15분 윈도우 및 활성 세션의 실행 데이터를 바탕으로
   * 에이전트별 실시간 Burn Rate(tokens/min, cost/min) 및 비정상 스파이크를 진단한다.
   */
  async calculateBurnRate(projectId: string, windowMinutes = 15): Promise<BurnRateStatus> {
    const now = new Date();
    const since = new Date(now.getTime() - windowMinutes * 60 * 1000);

    const runs = await this.runs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.agent', 'a')
      .where('a.project_id = :projectId', { projectId })
      .andWhere(
        '(r.started_at >= :since OR (r.ended_at IS NOT NULL AND r.ended_at >= :since) OR r.status = :runningStatus)',
        { since, runningStatus: 'running' },
      )
      .orderBy('r.started_at', 'DESC')
      .getMany();

    return computeBurnRate(
      runs.map((r) => ({
        agent_name: r.agent?.name,
        tokens_used: r.tokens_used,
        cost: r.cost,
        status: r.status,
        started_at: r.started_at,
        ended_at: r.ended_at,
      })),
      windowMinutes,
      now,
    );
  }
}

/** 타임존 문자열 검증 및 fallback */
function sanitizeTimeZone(tz?: string): string {
  if (!tz) return 'Asia/Seoul';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return 'Asia/Seoul';
  }
}

/** 주어진 타임존 기준 최근 N일간의 YYYY-MM-DD 목록 생성 */
function getDailyDates(days: number, tz: string): string[] {
  const dates: string[] = [];
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    dates.push(formatter.format(d));
  }
  return dates;
}

/** 주어진 타임존 기준 최근 N시간의 YYYY-MM-DD HH:00 목록 생성 */
function getHourlyBuckets(hours: number, tz: string): TimeSeriesBucket[] {
  const buckets: TimeSeriesBucket[] = [];
  const now = new Date();
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get('year') ?? '2026';
    const m = get('month') ?? '01';
    const day = get('day') ?? '01';
    let h = get('hour') ?? '00';
    if (h === '24') h = '00';
    const key = `${y}-${m}-${day} ${h}:00`;
    const label = `${h}:00`;
    buckets.push({ key, label, tokens: '0', cost: '0.0000' });
  }
  return buckets;
}

/** 주어진 타임존 기준 최근 N일간의 TimeSeriesBucket 목록 생성 */
function getDailyBuckets(days: number, tz: string): TimeSeriesBucket[] {
  const buckets: TimeSeriesBucket[] = [];
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const key = formatter.format(d);
    const label = key.slice(5).replace('-', '/'); // '09/17'
    buckets.push({ key, label, tokens: '0', cost: '0.0000' });
  }
  return buckets;
}

/** 주어진 타임존 기준 최근 N개월간의 TimeSeriesBucket 목록 생성 */
function getMonthlyBuckets(months: number, tz: string): TimeSeriesBucket[] {
  const buckets: TimeSeriesBucket[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get('year') ?? '2026';
    const m = get('month') ?? '01';
    const key = `${y}-${m}`;
    const label = `${y.slice(2)}.${m}`; // '26.09'
    buckets.push({ key, label, tokens: '0', cost: '0.0000' });
  }
  return buckets;
}

/** raw 쿼리 결과의 날짜를 'YYYY-MM-DD' 키로 정규화한다. */
function toDateKey(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

/** raw 쿼리 결과의 버킷 키를 정규화한다. */
function toBucketKey(value: Date | string): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function resolveProvider(
  modelCode: string,
  agentName: string,
): 'anthropic' | 'google' | 'openai' | 'deepseek' | 'other' {
  const combined = `${modelCode} ${agentName}`.toLowerCase();
  if (combined.includes('claude') || combined.includes('anthropic')) return 'anthropic';
  if (
    combined.includes('gemini') ||
    combined.includes('antigravity') ||
    combined.includes('google')
  ) {
    return 'google';
  }
  if (combined.includes('gpt') || combined.includes('openai')) return 'openai';
  if (combined.includes('deepseek')) return 'deepseek';
  return 'other';
}

function resolveDisplayName(modelCode: string, agentName: string): string {
  const modelLabels: Record<string, string> = {
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3.7-flash': 'Gemini 3.7 Flash',
    'gemini-3.6-flash': 'Gemini 3.6 Flash',
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'claude-fable-5-1': 'Claude Fable 5.1',
    'claude-fable-5': 'Claude Fable 5',
    'claude-opus-5': 'Claude Opus 5',
    'claude-sonnet-5': 'Claude Sonnet 5',
    'claude-haiku-5': 'Claude Haiku 5',
    'gpt-6-astra': 'GPT-6 Astra',
    'gpt-6': 'GPT-6',
    'gpt-5.6-sol': 'GPT-5.6 Sol',
    'gpt-5.6-terra': 'GPT-5.6 Terra',
    'gpt-5.6-luna': 'GPT-5.6 Luna',
    'deepseek-chat': 'DeepSeek Chat',
    'deepseek-reasoner': 'DeepSeek Reasoner',
  };

  const baseLabel = modelLabels[modelCode] || modelCode;
  const cleanAgent = (agentName || '').trim();
  if (cleanAgent && cleanAgent.toLowerCase() !== baseLabel.toLowerCase()) {
    return `${baseLabel} (${cleanAgent})`;
  }
  return baseLabel;
}
