export type AgentFilterType = 'all' | 'claude-code' | 'antigravity' | 'cursor';
export type TokenGranularity = 'hour' | 'day' | 'month';

export interface AgentTheme {
  label: string;
  color: string;
  fill: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
}

export const AGENT_THEMES: Record<string, AgentTheme> = {
  total: {
    label: '전체 합계',
    color: '#059669',
    fill: '#059669',
    badgeBg: '#ecfdf5',
    badgeText: '#047857',
    borderColor: '#a7f3d0',
  },
  'claude-code': {
    label: 'Claude Code',
    color: '#8b5cf6',
    fill: '#8b5cf6',
    badgeBg: '#f5f3ff',
    badgeText: '#6d28d9',
    borderColor: '#ddd6fe',
  },
  antigravity: {
    label: 'Antigravity',
    color: '#3b82f6',
    fill: '#3b82f6',
    badgeBg: '#eff6ff',
    badgeText: '#1d4ed8',
    borderColor: '#bfdbfe',
  },
  cursor: {
    label: 'Cursor',
    color: '#f59e0b',
    fill: '#f59e0b',
    badgeBg: '#fffbeb',
    badgeText: '#b45309',
    borderColor: '#fde68a',
  },
};

export function getAgentTheme(agentName: string): AgentTheme {
  const lower = agentName.toLowerCase();
  if (lower.startsWith('claude')) {
    return AGENT_THEMES['claude-code'];
  }
  if (lower.startsWith('antigravity') || lower.startsWith('gemini')) {
    return AGENT_THEMES.antigravity;
  }
  if (lower.startsWith('cursor')) {
    return AGENT_THEMES.cursor;
  }
  return {
    label: agentName,
    color: '#6b7280',
    fill: '#6b7280',
    badgeBg: '#f3f4f6',
    badgeText: '#374151',
    borderColor: '#e5e7eb',
  };
}

export function buildTokenUsageUrl(
  projectId: string,
  filter: AgentFilterType | string[] = 'all',
  tz?: string,
  granularity?: TokenGranularity,
): string {
  const params = new URLSearchParams();
  if (Array.isArray(filter)) {
    if (filter.length > 0 && !filter.includes('all')) {
      params.set('agent_name', filter.join(','));
    }
  } else if (filter !== 'all') {
    params.set('agent_name', filter);
  }
  if (tz) {
    params.set('tz', tz);
  }
  if (granularity) {
    params.set('granularity', granularity);
  }
  const qs = params.toString();
  return `/projects/${projectId}/token-usage${qs ? `?${qs}` : ''}`;
}

export function getAgentLabel(agentName: string): string {
  const lower = agentName.toLowerCase();
  if (lower.startsWith('claude')) {
    return 'Claude Code';
  }
  if (lower.startsWith('antigravity') || lower.startsWith('gemini')) {
    return 'Antigravity';
  }
  if (lower.startsWith('cursor')) {
    return 'Cursor';
  }
  return agentName;
}
