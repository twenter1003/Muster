import { describe, it, expect } from 'vitest';
import { buildTokenUsageUrl, getAgentLabel, getAgentTheme } from './agentFilter';

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

    it('cursor 필터일 때는 ?agent_name=cursor를 붙인다', () => {
      expect(buildTokenUsageUrl(projectId, 'cursor')).toBe(
        '/projects/proj-123/token-usage?agent_name=cursor',
      );
    });

    it('복수 에이전트 배열이 주어지면 쉼표로 연결된 agent_name을 붙인다', () => {
      expect(buildTokenUsageUrl(projectId, ['claude-code', 'cursor'])).toBe(
        '/projects/proj-123/token-usage?agent_name=claude-code%2Ccursor',
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

    it('granularity가 주어지면 쿼리에 granularity를 붙인다', () => {
      expect(buildTokenUsageUrl(projectId, 'all', 'Asia/Seoul', 'hour')).toBe(
        '/projects/proj-123/token-usage?tz=Asia%2FSeoul&granularity=hour',
      );
      expect(buildTokenUsageUrl(projectId, 'claude-code', 'Asia/Seoul', 'month')).toBe(
        '/projects/proj-123/token-usage?agent_name=claude-code&tz=Asia%2FSeoul&granularity=month',
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

    it('cursor 에이전트 이름에 대해 "Cursor"를 반환한다', () => {
      expect(getAgentLabel('cursor')).toBe('Cursor');
    });

    it('기타 에이전트는 원래 이름을 반환한다', () => {
      expect(getAgentLabel('custom-agent')).toBe('custom-agent');
    });
  });

  describe('getAgentTheme', () => {
    it('각 에이전트별 올바른 브랜드 테마 및 색상을 반환한다', () => {
      const claude = getAgentTheme('claude-code');
      expect(claude.color).toBe('#8b5cf6');
      expect(claude.label).toBe('Claude Code');

      const gemini = getAgentTheme('antigravity');
      expect(gemini.color).toBe('#3b82f6');
      expect(gemini.label).toBe('Antigravity');

      const cursor = getAgentTheme('cursor');
      expect(cursor.color).toBe('#f59e0b');
      expect(cursor.label).toBe('Cursor');

      const unknown = getAgentTheme('unknown-agent');
      expect(unknown.color).toBe('#6b7280');
      expect(unknown.label).toBe('unknown-agent');
    });
  });
});
