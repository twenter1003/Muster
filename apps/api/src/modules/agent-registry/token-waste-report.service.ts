import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { AgentRun } from '../../database/entities';
import {
  assessSessionWaste,
  computeTokenWasteIntelligence,
  type CacheEfficiencyMetric,
  type OptimizationGuide,
  type TokenWasteIntelligence,
  type WasteLevel,
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
  waste_level: WasteLevel;
  wasted_tokens: number;
  wasted_cost_usd: string;
  recommendation: string;
}

export interface WasteReportJsonPayload {
  project_id: string;
  exported_at: string;
  summary: {
    total_sessions: number;
    total_tokens: number;
    total_cost: string;
    total_wasted_tokens: number;
    total_wasted_cost: string;
    waste_percentage: number;
    overall_waste_level: WasteLevel;
  };
  cache_roi_simulation: CacheEfficiencyMetric;
  optimization_guides: OptimizationGuide[];
  sessions: SessionWasteReportRow[];
}

/**
 * 2026 프롬프트 캐싱 최적화 시뮬레이션 및 토큰 낭비 인텔리전스 리포트(JSON/CSV).
 * `budget.service.ts`에서 분리했다 — 예산 한도/알림과는 다른 책임(사후 분석 리포트)이다.
 */
@Injectable()
export class TokenWasteReportService {
  constructor(@InjectRepository(AgentRun) private readonly runs: Repository<AgentRun>) {}

  /**
   * 프로젝트의 에이전트 실행 이력을 바탕으로 2026 프롬프트 캐싱 최적화 시뮬레이션 및
   * 토큰 낭비 인텔리전스를 산출한다.
   */
  async getTokenWasteIntelligence(projectId: string): Promise<TokenWasteIntelligence> {
    const runs = await this.runs
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.agent', 'a')
      .where('a.project_id = :projectId', { projectId })
      .orderBy('r.started_at', 'DESC')
      .take(100)
      .getMany();

    return computeTokenWasteIntelligence(
      runs.map((r) => ({
        tokens_used: r.tokens_used,
        cost: r.cost,
        agent_name: r.agent?.name,
      })),
    );
  }

  /**
   * 프로젝트의 세션별 토큰/비용 낭비 이력과 프롬프트 캐싱 ROI 시뮬레이션을
   * 구조화된 JSON 데이터로 생성한다.
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
        tokens_used: r.tokens_used,
        cost: r.cost,
        agent_name: r.agent?.name,
      })),
    );

    let totalTokens = 0;
    let totalCostNum = 0;
    let totalWastedTokens = 0;
    let totalWastedCostNum = 0;

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

      const waste = assessSessionWaste(r.tokens_used);
      const wastedCostNum =
        (safeCostNum * waste.estimated_wasted_tokens) / Math.max(1, r.tokens_used);

      totalTokens += r.tokens_used;
      totalCostNum += safeCostNum;
      totalWastedTokens += waste.estimated_wasted_tokens;
      totalWastedCostNum += wastedCostNum;

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
        waste_level: waste.level,
        wasted_tokens: waste.estimated_wasted_tokens,
        wasted_cost_usd: wastedCostNum.toFixed(4),
        recommendation: waste.reason,
      };
    });

    const wastePercentage =
      totalTokens > 0 ? Math.round((totalWastedTokens / totalTokens) * 100) : 0;

    return {
      project_id: projectId,
      exported_at: new Date().toISOString(),
      summary: {
        total_sessions: sessions.length,
        total_tokens: totalTokens,
        total_cost: totalCostNum.toFixed(4),
        total_wasted_tokens: totalWastedTokens,
        total_wasted_cost: totalWastedCostNum.toFixed(4),
        waste_percentage: wastePercentage,
        overall_waste_level: wasteIntelligence.waste_breakdown.level,
      },
      cache_roi_simulation: wasteIntelligence.cache_efficiency,
      optimization_guides: wasteIntelligence.optimization_guides,
      sessions,
    };
  }

  /**
   * 프로젝트의 세션별 토큰/비용 낭비 이력과 2026 캐싱 ROI 시뮬레이션을
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
      'waste_level',
      'wasted_tokens',
      'wasted_cost_usd',
      'recommendation',
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
          s.waste_level,
          s.wasted_tokens,
          s.wasted_cost_usd,
          s.recommendation,
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
      'total_wasted_tokens',
      'total_wasted_cost_usd',
      'waste_percentage',
      'potential_cache_savings_usd',
      'savings_percentage',
    ];
    lines.push(summaryHeaders.map(escapeCell).join(','));

    lines.push(
      [
        'PROJECT_SUMMARY',
        report.summary.total_sessions,
        report.summary.total_tokens,
        report.summary.total_cost,
        report.summary.total_wasted_tokens,
        report.summary.total_wasted_cost,
        `${report.summary.waste_percentage}%`,
        report.cache_roi_simulation.potential_savings,
        `${report.cache_roi_simulation.savings_percentage}%`,
      ]
        .map(escapeCell)
        .join(','),
    );

    // UTF-8 BOM 프리픽스 붙여서 반환
    return '﻿' + lines.join('\r\n');
  }
}
