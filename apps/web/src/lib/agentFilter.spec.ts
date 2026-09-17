import { describe, it, expect } from 'vitest';
import { buildTokenUsageUrl, getAgentLabel } from './agentFilter';

describe('agentFilter', () => {
  describe('buildTokenUsageUrl', () => {
    const projectId = 'proj-123';

    it('all 필터일 때는 agent_name 쿼리 없이 기본 엔드포인트를 반환한다', () => {
      expect(buildTokenUsageUrl(projectId, 'all')).toBe('/projects/proj-123/token-usage');
    });

    it('claude-code 필터일 때는 ?agent_name=claude-code를 붙인다', () => {
      expect(buildTokenUsageUrl(projectId, 'claude-code')).toBe(
        '/projects/proj-123/token-usage?agent_name=claude-code',
      );
    });

    it('antigravity 필터일 때는 ?agent_name=antigravity를 붙인다', () => {
      expect(buildTokenUsageUrl(projectId, 'antigravity')).toBe(
        '/projects/proj-123/token-usage?agent_name=antigravity',
      );
    });

    it('tz가 주어지면 쿼리에 tz를 붙인다', () => {
      expect(buildTokenUsageUrl(projectId, 'all', 'Asia/Seoul')).toBe(
        '/projects/proj-123/token-usage?tz=Asia%2FSeoul',
      );
      expect(buildTokenUsageUrl(projectId, 'claude-code', 'Asia/Seoul')).toBe(
        '/projects/proj-123/token-usage?agent_name=claude-code&tz=Asia%2FSeoul',
      );
    });
  });

  describe('getAgentLabel', () => {
    it('claude-code 에이전트 이름에 대해 "Claude Code"를 반환한다', () => {
      expect(getAgentLabel('claude-code')).toBe('Claude Code');
      expect(getAgentLabel('claude')).toBe('Claude Code');
    });

    it('antigravity 에이전트 이름에 대해 "Antigravity"를 반환한다', () => {
      expect(getAgentLabel('antigravity')).toBe('Antigravity');
    });

    it('기타 에이전트는 원래 이름을 반환한다', () => {
      expect(getAgentLabel('custom-agent')).toBe('custom-agent');
    });
  });
});
