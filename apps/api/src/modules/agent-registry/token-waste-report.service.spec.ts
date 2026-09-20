import { Repository } from 'typeorm';
import { TokenWasteReportService } from './token-waste-report.service';
import { ModelPricingService } from './model-pricing.service';
import type { AgentRun } from '../../database/entities';

const PROJECT = '11111111-1111-4111-8111-111111111111';

describe('TokenWasteReportService', () => {
  describe('Waste Report Export (CSV & JSON)', () => {
    const mockRuns = [
      {
        id: 'run-1',
        agent: { name: 'claude-code' },
        model: 'claude-sonnet-5',
        status: 'completed',
        tokens_used: 60_000_000,
        cost: '18.0000',
        input_tokens: 840_000,
        cache_read_tokens: 59_160_000,
        cache_write_tokens: 0,
        started_at: new Date('2026-09-18T00:00:00Z'),
        ended_at: new Date('2026-09-18T01:00:00Z'), // 3600초 (60분)
      },
      {
        id: 'run-2',
        agent: { name: 'gemini-3.6-flash' },
        model: null,
        status: 'running',
        tokens_used: 5_000,
        cost: '0.0050',
        input_tokens: null,
        cache_read_tokens: null,
        cache_write_tokens: null,
        started_at: new Date('2026-09-18T02:00:00Z'),
        ended_at: null,
      },
    ];

    const buildService = () => {
      const qbMock = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockRuns),
      };

      const runsRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      } as unknown as Repository<AgentRun>;

      return new TokenWasteReportService(runsRepo, new ModelPricingService());
    };

    it('generateWasteReportJson이 세션별 캐시 효율과 비용 분포를 구조화하여 반환한다', async () => {
      const service = buildService();
      const report = await service.generateWasteReportJson(PROJECT);

      expect(report.project_id).toBe(PROJECT);
      expect(report.summary.total_sessions).toBe(2);
      expect(report.summary.total_tokens).toBe(60_005_000);
      expect(report.cache_efficiency.hit_rate_percentage).not.toBeNull();
      expect(Number(report.cache_efficiency.savings_usd)).toBeGreaterThan(0);
      expect(report.cost_distribution.sample_size).toBe(2);
      expect(report.sessions).toHaveLength(2);

      const session1 = report.sessions.find((s) => s.session_id === 'run-1');
      expect(session1).toBeDefined();
      expect(session1?.has_cache_breakdown).toBe(true);
      expect(session1?.cache_hit_rate_percentage).not.toBeNull();
      expect(session1?.duration_seconds).toBe(3600);
      expect(session1?.burn_rate_tokens_per_min).toBe(1_000_000); // 6천만 / 60분

      const session2 = report.sessions.find((s) => s.session_id === 'run-2');
      expect(session2?.has_cache_breakdown).toBe(false);
      expect(session2?.cache_hit_rate_percentage).toBeNull();
    });

    it('generateWasteReportCsv가 UTF-8 BOM과 RFC 4180 호환 CSV 문자열을 반환한다', async () => {
      const service = buildService();
      const csv = await service.generateWasteReportCsv(PROJECT);

      // BOM 검증
      expect(csv.startsWith('﻿')).toBe(true);

      // 헤더 검증
      expect(csv).toContain('"session_id","agent_name","status","started_at"');
      expect(csv).toContain('"claude-code"');
      expect(csv).toContain('"gemini-3.6-flash"');
      expect(csv).toContain('"PROJECT_SUMMARY"');
      expect(csv).toContain('cache_hit_rate_percentage');
    });
  });
});
