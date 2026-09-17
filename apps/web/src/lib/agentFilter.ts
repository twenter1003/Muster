export type AgentFilterType = 'all' | 'claude-code' | 'antigravity';
export type TokenGranularity = 'hour' | 'day' | 'month';

export function buildTokenUsageUrl(
  projectId: string,
  filter: AgentFilterType,
  tz?: string,
  granularity?: TokenGranularity,
): string {
  const params = new URLSearchParams();
  if (filter !== 'all') {
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
  if (agentName.startsWith('claude')) {
    return 'Claude Code';
  }
  if (agentName.startsWith('antigravity') || agentName.startsWith('gemini')) {
    return 'Antigravity';
  }
  return agentName;
}
