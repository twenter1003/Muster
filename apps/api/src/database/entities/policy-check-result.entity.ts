import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { type PolicyTool, type PolicyVerdict } from './enums';
import { ProjectEnvConfig } from './project-env-config.entity';

/**
 * Policy Gate 검사 결과. Trivy와 Conftest가 각각 한 행씩 남긴다 —
 * "어느 도구가 무엇을 잡아냈는지" 추적해야 룰 커버리지를 개선할 수 있기 때문 (Part 3 설계 결정).
 */
@Entity('policy_check_results')
@Index('idx_policy_results_config', ['env_config_id'])
export class PolicyCheckResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  env_config_id!: string;

  @Column({ type: 'varchar', length: 20 })
  tool!: PolicyTool;

  @Column({ type: 'varchar', length: 10 })
  verdict!: PolicyVerdict;

  /** 사람 승인 화면에 보여줄 자연어 위험도 설명 (Part 1 §3.2.1). */
  @Column({ type: 'text', nullable: true })
  risk_notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  checked_at!: Date;

  @ManyToOne(() => ProjectEnvConfig, (config) => config.policy_check_results, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'env_config_id' })
  env_config!: ProjectEnvConfig;
}
