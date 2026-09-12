/**
 * 19개 엔티티 배럴 (설계서 Part 3 확정 수와 일치).
 *
 * 엔티티를 모듈 폴더가 아니라 database/ 아래 모아 둔 이유:
 * LOG_ENTRIES가 PROJECTS를, AUDIT_LOGS가 USERS를 참조하는 식으로 스키마는 모듈 경계를
 * 가로지른다. 엔티티를 모듈 폴더에 두면 Ingest가 project-core를 import해야 해서
 * 모듈 경계 규칙(Part 2 §8)을 어기게 된다. 그 규칙은 "다른 모듈의 동작을 직접 호출하지 않는다"는
 * 뜻이고, DB 스키마는 모듈들이 공유하는 계약이므로 공용 위치에 둔다.
 */
export * from './enums';
export { User } from './user.entity';
export { Session } from './session.entity';
export { Project } from './project.entity';
export { ProjectApiKey } from './project-api-key.entity';
export { ProjectMember } from './project-member.entity';
export { GitIntegration } from './git-integration.entity';
export { Document } from './document.entity';
export { EnvTemplate } from './env-template.entity';
export { ProjectEnvConfig } from './project-env-config.entity';
export { PolicyCheckResult } from './policy-check-result.entity';
export { Agent } from './agent.entity';
export { AgentRun } from './agent-run.entity';
export { ProjectBudget } from './project-budget.entity';
export { LogEntry } from './log-entry.entity';
export { ProjectStageHistory } from './project-stage-history.entity';
export { HealthSnapshot } from './health-snapshot.entity';
export { AuditLog } from './audit-log.entity';
export { WebhookDelivery } from './webhook-delivery.entity';
export { DeploymentEvent } from './deployment-event.entity';
export { EnvConfigTransition } from './env-config-transition.entity';

import { User } from './user.entity';
import { Session } from './session.entity';
import { Project } from './project.entity';
import { ProjectApiKey } from './project-api-key.entity';
import { ProjectMember } from './project-member.entity';
import { GitIntegration } from './git-integration.entity';
import { Document } from './document.entity';
import { EnvTemplate } from './env-template.entity';
import { ProjectEnvConfig } from './project-env-config.entity';
import { PolicyCheckResult } from './policy-check-result.entity';
import { Agent } from './agent.entity';
import { AgentRun } from './agent-run.entity';
import { ProjectBudget } from './project-budget.entity';
import { LogEntry } from './log-entry.entity';
import { ProjectStageHistory } from './project-stage-history.entity';
import { HealthSnapshot } from './health-snapshot.entity';
import { AuditLog } from './audit-log.entity';
import { WebhookDelivery } from './webhook-delivery.entity';
import { DeploymentEvent } from './deployment-event.entity';
import { EnvConfigTransition } from './env-config-transition.entity';

/** DataSource에 등록할 엔티티 전체 목록. 새 엔티티를 추가하면 여기에도 넣어야 한다. */
export const ALL_ENTITIES = [
  User,
  Session,
  Project,
  ProjectApiKey,
  ProjectMember,
  GitIntegration,
  Document,
  EnvTemplate,
  ProjectEnvConfig,
  PolicyCheckResult,
  Agent,
  AgentRun,
  ProjectBudget,
  LogEntry,
  ProjectStageHistory,
  HealthSnapshot,
  AuditLog,
  WebhookDelivery,
  DeploymentEvent,
  EnvConfigTransition,
] as const;
