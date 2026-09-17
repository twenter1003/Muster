export type AgentFilterType = 'all' | 'claude-code' | 'antigravity';

export function buildTokenUsageUrl(
  projectId: string,
  filter: AgentFilterType,
  tz?: string,
): string {
  const params = new URLSearchParams();
  if (filter !== 'all') {
    params.set('agent_name', filter);
  }
  if (tz) {
    params.set('tz', tz);
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
