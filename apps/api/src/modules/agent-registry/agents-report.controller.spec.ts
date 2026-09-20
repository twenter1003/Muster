import { ProjectAgentsController } from './agents.controller';
import { TokenWasteReportService } from './token-waste-report.service';
import type { Response } from 'express';

describe('ProjectAgentsController - Waste Report Export', () => {
  let controller: ProjectAgentsController;
  let wasteReportService: Partial<TokenWasteReportService>;

  beforeEach(() => {
    wasteReportService = {
      generateWasteReportCsv: jest
        .fn()
        .mockResolvedValue('﻿"session_id","agent_name"\r\n"run-1","claude"'),
      generateWasteReportJson: jest.fn().mockResolvedValue({
        project_id: 'proj-1',
        exported_at: '2026-09-18T00:00:00Z',
        summary: {
          total_sessions: 1,
          total_tokens: 1000,
          total_cost: '0.0100',
        },
        cache_efficiency: {
          hit_rate_percentage: 70,
          input_tokens: 300,
          cache_read_tokens: 700,
          cache_write_tokens: 0,
          savings_usd: '0.0050',
          sessions_with_breakdown: 1,
          sessions_without_breakdown: 0,
        },
        cost_distribution: {
          median_cost_usd: '0.0100',
          p99_cost_usd: '0.0100',
          sample_size: 1,
          outliers: [],
        },
        optimization_guides: [],
        sessions: [],
      }),
    };

    controller = new ProjectAgentsController(
      {} as never,
      {} as never,
      {} as never,
      wasteReportService as TokenWasteReportService,
      {} as never,
    );
  });

  it('getWasteReportCsv가 적절한 헤더를 설정하고 CSV 문자열을 반환한다', async () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
    } as unknown as Response;

    const result = await controller.getWasteReportCsv('proj-1', res);

    expect(wasteReportService.generateWasteReportCsv).toHaveBeenCalledWith('proj-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="muster-waste-report-proj-1-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(result).toContain('"session_id","agent_name"');
  });

  it('getWasteReportJson이 적절한 헤더를 설정하고 JSON 페이로드를 반환한다', async () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((k: string, v: string) => {
        headers[k] = v;
      }),
    } as unknown as Response;

    const result = await controller.getWasteReportJson('proj-1', res);

    expect(wasteReportService.generateWasteReportJson).toHaveBeenCalledWith('proj-1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="muster-waste-report-proj-1-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(result.project_id).toBe('proj-1');
  });
});
