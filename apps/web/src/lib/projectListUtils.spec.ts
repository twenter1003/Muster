import { describe, expect, it } from 'vitest';
import {
  cleanRepoUrl,
  formatElapsedTime,
  fuzzyMatch,
  matchesSearch,
  matchesStatus,
  sortProjects,
  type ProjectListItemLike,
} from './projectListUtils';

describe('projectListUtils', () => {
  describe('fuzzyMatch', () => {
    it('빈 검색어는 항상 true', () => {
      expect(fuzzyMatch('Muster', '')).toBe(true);
      expect(fuzzyMatch('Muster', '   ')).toBe(true);
    });

    it('대상 텍스트가 null/undefined면 false', () => {
      expect(fuzzyMatch(null, 'test')).toBe(false);
      expect(fuzzyMatch(undefined, 'test')).toBe(false);
    });

    it('대소문자 무시 부분 일치', () => {
      expect(fuzzyMatch('Muster Web App', 'muster')).toBe(true);
      expect(fuzzyMatch('Muster Web App', 'WEB')).toBe(true);
      expect(fuzzyMatch('Muster Web App', 'app')).toBe(true);
    });

    it('퍼지 문자 순서 일치', () => {
      expect(fuzzyMatch('my-awesome-project', 'map')).toBe(true);
      expect(fuzzyMatch('my-awesome-project', 'xyz')).toBe(false);
    });
  });

  describe('matchesSearch', () => {
    const p: ProjectListItemLike = {
      id: '1',
      name: 'core-platform',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-10T00:00:00Z',
      repo_url: 'https://github.com/acme/core-platform-repo',
    };

    it('프로젝트명으로 검색 매칭', () => {
      expect(matchesSearch(p, 'core')).toBe(true);
      expect(matchesSearch(p, 'platform')).toBe(true);
      expect(matchesSearch(p, 'nomatch')).toBe(false);
    });

    it('레포 URL로 검색 매칭', () => {
      expect(matchesSearch(p, 'acme')).toBe(true);
      expect(matchesSearch(p, 'platform-repo')).toBe(true);
    });
  });

  describe('matchesStatus', () => {
    const liveProject: ProjectListItemLike = {
      id: '1',
      name: 'Live Proj',
      created_at: '2026-09-01',
      updated_at: '2026-09-01',
      active_agents: ['claude-code'],
      deploy_status: 'success',
    };

    const successProject: ProjectListItemLike = {
      id: '2',
      name: 'Success Proj',
      created_at: '2026-09-01',
      updated_at: '2026-09-01',
      active_agents: [],
      deploy_status: 'success',
    };

    const failProject: ProjectListItemLike = {
      id: '3',
      name: 'Fail Proj',
      created_at: '2026-09-01',
      updated_at: '2026-09-01',
      active_agents: [],
      deploy_status: 'failure',
    };

    it('all은 항상 true', () => {
      expect(matchesStatus(liveProject, 'all')).toBe(true);
      expect(matchesStatus(successProject, 'all')).toBe(true);
      expect(matchesStatus(failProject, 'all')).toBe(true);
    });

    it('live는 active_agents가 있을 때만 true', () => {
      expect(matchesStatus(liveProject, 'live')).toBe(true);
      expect(matchesStatus(successProject, 'live')).toBe(false);
    });

    it('deploy_success는 deploy_status === "success" 일 때 true', () => {
      expect(matchesStatus(successProject, 'deploy_success')).toBe(true);
      expect(matchesStatus(failProject, 'deploy_success')).toBe(false);
    });

    it('deploy_failure는 deploy_status === "failure" 일 때 true', () => {
      expect(matchesStatus(failProject, 'deploy_failure')).toBe(true);
      expect(matchesStatus(successProject, 'deploy_failure')).toBe(false);
    });
  });

  describe('sortProjects', () => {
    const p1: ProjectListItemLike = {
      id: '1',
      name: 'P1',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-05T10:00:00Z',
      health_score: 95,
      tokens: { total: '1000', totalCost: '0.05' },
    };
    const p2: ProjectListItemLike = {
      id: '2',
      name: 'P2',
      created_at: '2026-09-03T10:00:00Z',
      updated_at: '2026-09-02T10:00:00Z',
      health_score: 80,
      tokens: { total: '50000', totalCost: '1.20' },
    };

    it('created_desc 정렬', () => {
      const sorted = sortProjects([p1, p2], 'created_desc');
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
    });

    it('updated_desc 정렬', () => {
      const sorted = sortProjects([p1, p2], 'updated_desc');
      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
    });

    it('tokens_desc 정렬', () => {
      const sorted = sortProjects([p1, p2], 'tokens_desc');
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
    });

    it('cost_desc 정렬', () => {
      const sorted = sortProjects([p1, p2], 'cost_desc');
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('1');
    });

    it('health_desc 정렬', () => {
      const sorted = sortProjects([p1, p2], 'health_desc');
      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
    });
  });

  describe('formatElapsedTime', () => {
    it('1분 미만은 초 단위 표기', () => {
      expect(formatElapsedTime(0)).toBe('0s');
      expect(formatElapsedTime(45)).toBe('45s');
    });

    it('1분 이상 1시간 미만은 분·초 표기', () => {
      expect(formatElapsedTime(60)).toBe('1m 0s');
      expect(formatElapsedTime(134)).toBe('2m 14s');
    });

    it('1시간 이상은 시·분·초 표기', () => {
      expect(formatElapsedTime(3665)).toBe('1h 1m 5s');
    });

    it('음수는 0s로 처리', () => {
      expect(formatElapsedTime(-10)).toBe('0s');
    });
  });

  describe('cleanRepoUrl', () => {
    it('github URL 접두사 정리', () => {
      expect(cleanRepoUrl('https://github.com/muster/web')).toBe('muster/web');
      expect(cleanRepoUrl('https://www.github.com/org/repo')).toBe('org/repo');
      expect(cleanRepoUrl('http://github.com/user/proj')).toBe('user/proj');
      expect(cleanRepoUrl(null)).toBe('');
    });
  });
});
