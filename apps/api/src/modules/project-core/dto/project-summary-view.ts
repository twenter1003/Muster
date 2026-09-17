/**
 * 프로젝트 요약 뷰 (설계서 N+1 API 요청 최적화).
 * 목록 화면에서 프로젝트당 health, deployment, logs, token-usage를 별도로 호출하던 병목을 해결하기 위해
 * 단일 요청으로 필요한 메타데이터를 일괄 제공한다.
 */
export interface ProjectSummaryView {
  id: string;
  name: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
  repo_url: string | null;
  health_score: number | null;
  latest_deploy_status: string | null; // 'success' | 'failure' | null
  latest_log_message: string | null;
  active_agents: string[]; // 현재 status === 'running'인 에이전트 이름 목록 (예: ['claude-code'])
  tokens: {
    today: string;
    month: string;
    total: string;
    today_cost: string;
    month_cost: string;
    total_cost: string;
  };
}
