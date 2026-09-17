export type StatusFilterType = 'all' | 'live' | 'deploy_success' | 'deploy_failure';

export type SortOptionType =
  | 'created_desc'
  | 'updated_desc'
  | 'tokens_desc'
  | 'cost_desc'
  | 'health_desc';

export interface ProjectListItemLike {
  id: string;
  name: string;
  current_stage?: string;
  created_at: string;
  updated_at: string;
  repo_url?: string | null;
  health_score?: number | null;
  deploy_status?: string | null;
  latest_deploy_status?: string | null;
  last_log?: string | null;
  latest_log_message?: string | null;
  tokens?: {
    today?: string;
    total?: string;
    month?: string;
    todayCost?: string;
    totalCost?: string;
    today_cost?: string;
    total_cost?: string;
  } | null;
  active_agents?: string[];
}

/**
 * 텍스트와 검색어 간 실시간 퍼지 / 부분 일치 검사.
 * 대소문자를 구분하지 않으며 공백 정규화를 수행한다.
 */
export function fuzzyMatch(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  const q = query.trim().toLowerCase();
  if (q === '') return true;

  const target = text.toLowerCase();
  if (target.includes(q)) return true;

  // 연속되지 않는 문자 매칭 (퍼지)
  let qIdx = 0;
  for (let i = 0; i < target.length && qIdx < q.length; i++) {
    if (target[i] === q[qIdx]) {
      qIdx++;
    }
  }
  return qIdx === q.length;
}

/**
 * 프로젝트 이름 및 레포 URL 기준으로 검색 필터링.
 */
export function matchesSearch(project: ProjectListItemLike, query: string): boolean {
  if (!query.trim()) return true;
  return fuzzyMatch(project.name, query) || fuzzyMatch(project.repo_url, query);
}

/**
 * 상태 필터 칩 조건 검사:
 * - 'all': 전체
 * - 'live': 활성 에이전트 작업 중 (active_agents.length > 0)
 * - 'deploy_success': 배포 성공
 * - 'deploy_failure': 배포 실패
 */
export function matchesStatus(
  project: ProjectListItemLike,
  status: StatusFilterType,
): boolean {
  if (status === 'all') return true;
  if (status === 'live') {
    return (project.active_agents?.length ?? 0) > 0;
  }
  const deployStatus = project.deploy_status ?? project.latest_deploy_status ?? null;
  if (status === 'deploy_success') {
    return deployStatus === 'success';
  }
  if (status === 'deploy_failure') {
    return deployStatus === 'failure';
  }
  return true;
}

/**
 * 정렬 옵션에 따라 프로젝트 목록을 정렬.
 */
export function sortProjects<T extends ProjectListItemLike>(
  projects: T[],
  sortBy: SortOptionType,
): T[] {
  return [...projects].sort((a, b) => {
    switch (sortBy) {
      case 'created_desc': {
        const tA = new Date(a.created_at).getTime() || 0;
        const tB = new Date(b.created_at).getTime() || 0;
        return tB - tA;
      }
      case 'updated_desc': {
        const tA = new Date(a.updated_at).getTime() || 0;
        const tB = new Date(b.updated_at).getTime() || 0;
        return tB - tA;
      }
      case 'tokens_desc': {
        const tokA = Number(a.tokens?.total ?? 0);
        const tokB = Number(b.tokens?.total ?? 0);
        return tokB - tokA;
      }
      case 'cost_desc': {
        const costA = Number(a.tokens?.totalCost ?? a.tokens?.total_cost ?? 0);
        const costB = Number(b.tokens?.totalCost ?? b.tokens?.total_cost ?? 0);
        return costB - costA;
      }
      case 'health_desc': {
        const hA = typeof a.health_score === 'number' ? a.health_score : -1;
        const hB = typeof b.health_score === 'number' ? b.health_score : -1;
        return hB - hA;
      }
      default:
        return 0;
    }
  });
}

/**
 * 에이전트 작업 경과 시간 초를 사람이 읽기 좋은 형식으로 변환 (예: 134초 -> "2m 14s").
 */
export function formatElapsedTime(seconds: number): string {
  if (seconds < 0) return '0s';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m ${remSec}s`;
}

/**
 * GitHub 레포 URL에서 'https://github.com/' 또는 'https://' 제거하여 간결한 이름 반환.
 */
export function cleanRepoUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/^https?:\/\//, '');
}
