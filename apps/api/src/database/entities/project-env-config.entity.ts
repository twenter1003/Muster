import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BUILD_STATUSES, type BuildStatus } from './enums';
import { Project } from './project.entity';
import { EnvTemplate } from './env-template.entity';
import { PolicyCheckResult } from './policy-check-result.entity';

/**
 * 프로젝트에 실제로 적용된 환경 구성. 템플릿에서 파생될 수도, 처음부터 생성될 수도 있다.
 *
 * template_id가 nullable인 이유는 두 가지다:
 * 1. Part 4 §5.2 요청 예시가 `"template_id": "uuid | null"`로 명시
 * 2. 템플릿이 삭제돼도 이 구성 이력은 남아야 하므로 FK를 ON DELETE SET NULL로 둔다
 *    (RESTRICT를 택하면 과거 구성 때문에 템플릿을 영영 못 지우게 된다)
 */
@Entity('project_env_configs')
@Index('idx_env_configs_project_created', ['project_id', 'created_at'])
export class ProjectEnvConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'uuid', nullable: true })
  template_id!: string | null;

  @Column({ type: 'jsonb' })
  stack_config!: Record<string, unknown>;

  /** LLM이 생성한 Dockerfile/compose 내용. */
  @Column({ type: 'jsonb' })
  docker_config!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: BUILD_STATUSES[0] })
  build_status!: BuildStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => EnvTemplate, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'template_id' })
  template!: EnvTemplate | null;

  @OneToMany(() => PolicyCheckResult, (result) => result.env_config)
  policy_check_results!: PolicyCheckResult[];
}
