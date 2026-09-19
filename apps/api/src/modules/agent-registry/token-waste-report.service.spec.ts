import { Repository } from 'typeorm';
import { TokenWasteReportService } from './token-waste-report.service';
import type { AgentRun } from '../../database/entities';

const PROJECT = '11111111-1111-4111-8111-111111111111';

describe('TokenWasteReportService', () => {
  describe('Waste Report Export (CSV & JSON)', () => {
    const mockRuns = [
      {
        id: 'run-1',
        agent: { name: 'claude-code' },
        status: 'completed',
        tokens_used: 60_000_000,
        cost: '18.0000',
        started_at: new Date('2026-09-18T00:00:00Z'),
        ended_at: new Date('2026-09-18T01:00:00Z'), // 3600초 (60분)
      },
      {
        id: 'run-2',
        agent: { name: 'gemini-3.6-flash' },
        status: 'running',
        tokens_used: 5_000,
        cost: '0.0050',
        started_at: new Date('2026-09-18T02:00:00Z'),
        ended_at: null,
      },
    ];

    it('generateWasteReportJson이 세션별 낭비 메트릭과 ROI 시뮬레이션을 구조화하여 반환한다', async () => {
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

      const service = new TokenWasteReportService(runsRepo);
      const report = await service.generateWasteReportJson(PROJECT);

      expect(report.project_id).toBe(PROJECT);
      expect(report.summary.total_sessions).toBe(2);
      expect(report.summary.total_tokens).toBe(60_005_000);
      expect(report.summary.total_wasted_tokens).toBeGreaterThan(0);
      expect(report.cache_roi_simulation).toBeDefined();
      expect(report.sessions).toHaveLength(2);

      const session1 = report.sessions.find((s) => s.session_id === 'run-1');
      expect(session1).toBeDefined();
      expect(session1?.waste_level).toBe('HIGH_WASTE');
      expect(session1?.duration_seconds).toBe(3600);
      expect(session1?.burn_rate_tokens_per_min).toBe(1_000_000); // 6천만 / 60분
    });

    it('generateWasteReportCsv가 UTF-8 BOM과 RFC 4180 호환 CSV 문자열을 반환한다', async () => {
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

      const service = new TokenWasteReportService(runsRepo);
      const csv = await service.generateWasteReportCsv(PROJECT);

      // BOM 검증
      expect(csv.startsWith('﻿')).toBe(true);

      // 헤더 검증
      expect(csv).toContain('"session_id","agent_name","status","started_at"');
      expect(csv).toContain('"claude-code"');
      expect(csv).toContain('"gemini-3.6-flash"');
      expect(csv).toContain('"PROJECT_SUMMARY"');
      expect(csv).toContain('"HIGH_WASTE"');
    });
  });
});
