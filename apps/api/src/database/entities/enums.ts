/**
 * 문자열 컬럼의 허용값 집합.
 *
 * 네이티브 PG enum 타입 대신 varchar + CHECK 제약으로 구현한다.
 * 네이티브 enum은 값 추가에 ALTER TYPE이 필요하고 트랜잭션 안에서 롤백이 까다로워,
 * 값이 늘어날 여지가 있는 도메인(진행 단계, 감사 액션 등)에 부담이 크다.
 */

/** PROJECTS.current_stage — 설계서 Part 3 Enum 값 정의 */
export const PROJECT_STAGES = [
  'planning',
  'design',
  'development',
  'testing',
  'deployment',
  'operation',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

/** PROJECT_MEMBERS.role — Part 1 §3.6 */
export const MEMBER_ROLES = ['owner', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** DOCUMENTS.type — Part 4 §4의 타입 필터 `?type=prd|srs|tech_spec|other` */
export const DOCUMENT_TYPES = ['prd', 'srs', 'tech_spec', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * PROJECT_ENV_CONFIGS.build_status — Part 4 §5.2의 상태 전이.
 * 문서의 6개에 `rejected`(reject 엔드포인트의 귀결)와 `succeeded`(실행 성공 종료)를 더한 8개.
 *
 * generated → policy_passed | policy_blocked
 * policy_passed → approved | rejected
 * approved → running
 * running → succeeded | failed
 */
export const BUILD_STATUSES = [
  'generated',
  'policy_passed',
  'policy_blocked',
  'approved',
  'rejected',
  'running',
  'succeeded',
  'failed',
] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

/** POLICY_CHECK_RESULTS.tool — Part 2 §6.1 */
export const POLICY_TOOLS = ['trivy', 'conftest'] as const;
export type PolicyTool = (typeof POLICY_TOOLS)[number];

/** POLICY_CHECK_RESULTS.verdict — Part 4 §5.2가 `verdict=pass`를 명시 */
export const POLICY_VERDICTS = ['pass', 'fail'] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

/** AGENT_RUNS.status — ended_at이 null인 동안 running, 종료 시 나머지 셋 중 하나. */
export const AGENT_RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled'] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

/** LOG_ENTRIES.level — Part 4 §7.2의 레벨 필터 `?level=error|warn|info` */
export const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** DOCUMENTS.upload_status — signed URL 발급 시 pending, 완료 확인 후 completed. */
export const UPLOAD_STATUSES = ['pending', 'completed'] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/**
 * AUDIT_LOGS.action — 닫힌 값 집합.
 * 새 감사 대상 행위를 추가할 때는 여기와 DB CHECK 제약을 함께 갱신해야 한다.
 */
export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'project.create',
  'project.update',
  'project.delete',
  'document.create',
  'document.delete',
  'agent.create',
  'agent.update',
  'agent.delete',
  'env_config.create',
  'env_config.approve',
  'env_config.reject',
  'template.create',
  'template.delete',
  'budget.update',
  'api_key.create',
  'api_key.revoke',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
