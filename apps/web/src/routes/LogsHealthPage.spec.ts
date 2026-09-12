import { describe, expect, it } from 'vitest';
import { latestPerProject } from './LogsHealthPage';

// 전역 주입을 켜지 않은 저장소라 describe/it/expect를 명시적으로 들여온다(api.spec.ts와 같다).

type Snapshot = Parameters<typeof latestPerProject>[0][number];

const snapshot = (
  id: string,
  project_id: string,
  project_name: string,
  measured_at: string,
): Snapshot => ({
  id,
  project_id,
  project_name,
  deploy_freq_score: null,
  lead_time_score: null,
  change_fail_score: null,
  mttr_score: null,
  composite_score: '3.0',
  measured_at,
});

describe('latestPerProject', () => {
  it('프로젝트마다 가장 최근 스냅샷 한 장만 남긴다', () => {
    const out = latestPerProject([
      snapshot('a2', 'p1', '가', '2026-09-12T10:00:00.000Z'),
      snapshot('a1', 'p1', '가', '2026-09-11T10:00:00.000Z'),
      snapshot('b1', 'p2', '나', '2026-09-09T10:00:00.000Z'),
    ]);
    expect(out.map((s) => s.id)).toEqual(['a2', 'b1']);
  });

  it('도착 순서가 최신순이 아니어도 최신을 고른다', () => {
    const out = latestPerProject([
      snapshot('a1', 'p1', '가', '2026-09-11T10:00:00.000Z'),
      snapshot('a2', 'p1', '가', '2026-09-12T10:00:00.000Z'),
    ]);
    expect(out.map((s) => s.id)).toEqual(['a2']);
  });

  it('프로젝트 이름순으로 세운다 — 측정 시각순이면 행이 조회마다 자리를 바꾼다', () => {
    const out = latestPerProject([
      snapshot('b1', 'p2', '나', '2026-09-12T10:00:00.000Z'),
      snapshot('a1', 'p1', '가', '2026-09-01T10:00:00.000Z'),
    ]);
    expect(out.map((s) => s.project_name)).toEqual(['가', '나']);
  });

  it('빈 목록은 빈 목록이다', () => {
    expect(latestPerProject([])).toEqual([]);
  });
});
