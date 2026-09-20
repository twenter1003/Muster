import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { AgentRun } from '../../database/entities';
import { ModelPricingService } from './model-pricing.service';
import {
  computeSessionCacheView,
  computeTokenWasteIntelligence,
  type CacheEfficiencyMetric,
  type CostDistribution,
  type OptimizationGuide,
} from './token-waste';

export interface SessionWasteReportRow {
  session_id: string;
  agent_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  tokens_used: number;
  cost_usd: string;
  burn_rate_tokens_per_min: number;
  cache_hit_rate_percentage: number | null;
  cache_savings_usd: string;
  has_cache_breakdown: boolean;
}

export interface WasteReportJsonPayload {
  project_id: string;
  exported_at: string;
  summary: {
    total_sessions: number;
    total_tokens: number;
    total_cost: string;
  };
  cache_efficiency: CacheEfficiencyMetric;
  cost_distribution: CostDistribution;
  optimization_guides: OptimizationGuide[];
  sessions: SessionWasteReportRow[];
}

/**
 * 캐싱 적중률·절감액(실측) 및 세션당 비용 분포 리포트(JSON/CSV).
 * `budget.service.ts`에서 분리했다 — 예산 한도/알림과는 다른 책임(사후 분석 리포트)이다.
 *
 * 임계값 기반 "낭비 판정"은 제거했다(DESIGN_DRIFT 18번) — 캐시 읽기가 쌓인 세션을
 * 가장 낭비가 심하다고 찍는 오류가 있었고, 실제 캐시 내역 컬럼이 있는 지금은
 * 추정 대신 측정값을 낼 수 있다.
 */
@Injectable()
export class TokenWasteReportService {
  constructor(
    @InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>,
    private readonly modelPricing: ModelPricingService = new ModelPricingService(),
  ) {}

  private readonly resolvePricing = (model?: string, agentName?: string) =>
    this.modelPricing.resolvePricingRates(model, agentName);

  /**
   * 프로젝트의 세션별 캐시 효율 이력과 비용 분포를 구조화된 JSON 데이터로 생성한다.
   */
  async generateWasteReportJson(projectId: string): Promise<WasteReportJsonPayload> {
    const runs = await this.runs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.agent', 'a')
      .where('a.project_id = :projectId', { projectId })
      .orderBy('r.started_at', 'DESC')
      .take(100)
      .getMany();

    const wasteIntelligence = computeTokenWasteIntelligence(
      runs.map((r) => ({
        id: r.id,
        cost: r.cost,
        input_tokens: r.input_tokens,
        cache_read_tokens: r.cache_read_tokens,
        cache_write_tokens: r.cache_write_tokens,
        model: r.model,
        agent_name: r.agent?.name,
      })),
      this.resolvePricing,
    );

    let totalTokens = 0;
    let totalCostNum = 0;

    const sessions: SessionWasteReportRow[] = runs.map((r) => {
      const durationSeconds = r.ended_at
        ? Math.max(
            0,
            Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000),
          )
        : Math.max(0, Math.round((Date.now() - new Date(r.started_at).getTime()) / 1000));

      const durationMinutes = Math.max(1 / 60, durationSeconds / 60);
      const burnRate = Math.round(r.tokens_used / durationMinutes);

      const costNum = typeof r.cost === 'string' ? parseFloat(r.cost) : Number(r.cost || 0);
      const safeCostNum = Number.isFinite(costNum) ? costNum : 0;

      const cache = computeSessionCacheView(
        {
          id: r.id,
          input_tokens: r.input_tokens,
          cache_read_tokens: r.cache_read_tokens,
          cache_write_tokens: r.cache_write_tokens,
          model: r.model,
          agent_name: r.agent?.name,
        },
        this.resolvePricing,
      );

      totalTokens += r.tokens_used;
      totalCostNum += safeCostNum;

      return {
        session_id: r.id,
        agent_name: r.agent?.name || 'unknown',
        status: r.status,
        started_at: r.started_at.toISOString(),
        ended_at: r.ended_at ? r.ended_at.toISOString() : null,
        duration_seconds: durationSeconds,
        tokens_used: r.tokens_used,
        cost_usd: safeCostNum.toFixed(4),
        burn_rate_tokens_per_min: burnRate,
        cache_hit_rate_percentage: cache.hit_rate_percentage,
        cache_savings_usd: cache.savings_usd,
        has_cache_breakdown: cache.has_breakdown,
      };
    });

    return {
      project_id: projectId,
      exported_at: new Date().toISOString(),
      summary: {
        total_sessions: sessions.length,
        total_tokens: totalTokens,
        total_cost: totalCostNum.toFixed(4),
      },
      cache_efficiency: wasteIntelligence.cache_efficiency,
      cost_distribution: wasteIntelligence.cost_distribution,
      optimization_guides: wasteIntelligence.optimization_guides,
      sessions,
    };
  }

  /**
   * 프로젝트의 세션별 캐시 효율 이력과 비용 분포를
   * RFC 4180 호환 CSV 문자열로 생성한다.
   * Excel에서 열었을 때 한글이 깨지지 않도록 UTF-8 BOM(﻿)을 포함한다.
   */
  async generateWasteReportCsv(projectId: string): Promise<string> {
    const report = await this.generateWasteReportJson(projectId);

    const escapeCell = (value: unknown): string => {
      const str = value === null || value === undefined ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [];

    // 1. 헤더
    const headers = [
      'session_id',
      'agent_name',
      'status',
      'started_at',
      'ended_at',
      'duration_seconds',
      'tokens_used',
      'cost_usd',
      'burn_rate_tokens_per_min',
      'cache_hit_rate_percentage',
      'cache_savings_usd',
      'has_cache_breakdown',
    ];
    lines.push(headers.map(escapeCell).join(','));

    // 2. 세션 행
    for (const s of report.sessions) {
      lines.push(
        [
          s.session_id,
          s.agent_name,
          s.status,
          s.started_at,
          s.ended_at ?? '',
          s.duration_seconds,
          s.tokens_used,
          s.cost_usd,
          s.burn_rate_tokens_per_min,
          s.cache_hit_rate_percentage ?? '',
          s.cache_savings_usd,
          s.has_cache_breakdown,
        ]
          .map(escapeCell)
          .join(','),
      );
    }

    // 3. 빈 행 구분 후 요약 섹션
    lines.push('');
    const summaryHeaders = [
      'metric_type',
      'total_sessions',
      'total_tokens',
      'total_cost_usd',
      'cache_hit_rate_percentage',
      'cache_savings_usd',
      'cost_median_usd',
      'cost_p99_usd',
    ];
    lines.push(summaryHeaders.map(escapeCell).join(','));

    lines.push(
      [
        'PROJECT_SUMMARY',
        report.summary.total_sessions,
        report.summary.total_tokens,
        report.summary.total_cost,
        report.cache_efficiency.hit_rate_percentage ?? '',
        report.cache_efficiency.savings_usd,
        report.cost_distribution.median_cost_usd,
        report.cost_distribution.p99_cost_usd,
      ]
        .map(escapeCell)
        .join(','),
    );

    // UTF-8 BOM 프리픽스 붙여서 반환
    return '﻿' + lines.join('\r\n');
  }
}
