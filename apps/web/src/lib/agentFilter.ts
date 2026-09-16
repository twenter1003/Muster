export type AgentFilterType = 'all' | 'claude-code' | 'antigravity';

export function buildTokenUsageUrl(projectId: string, filter: AgentFilterType): string {
  if (filter === 'all') {
    return `/projects/${projectId}/token-usage`;
  }
  return `/projects/${projectId}/token-usage?agent_name=${filter}`;
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
