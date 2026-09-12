import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { type BuildStatus } from './enums';
import { ProjectEnvConfig } from './project-env-config.entity';
import { User } from './user.entity';

/**
 * 환경 구성의 상태 전이 이력.
 *
 * PROJECT_ENV_CONFIGS.build_status는 **현재 상태 하나**만 담는다. 화면은 그 한 값에서
 * 지나온 길을 역산하고 있었는데(`approved`면 policy_passed도 지났겠지), 역산으로는
 * 알 수 없는 것이 셋이다:
 *   1. 반려 뒤 재검사로 policy_passed에 다시 온 구성과 처음부터 통과한 구성이 구별되지 않는다
 *   2. 각 단계에 **언제** 닿았는지 — 역산은 지나온 모든 칸에 생성 시각을 찍는다
 *   3. **누가** 승인했는지 — 승인은 사람의 판단이고 그 기록이 남지 않으면 따질 수 없다
 *
 * ProjectStageHistory와 같은 꼴이다(current_stage ↔ 타임라인). 다른 점은 from_status를
 * 함께 남기는 것인데, 진행 단계와 달리 여기는 분기(policy_blocked·rejected)가 있어
 * "직전이 무엇이었나"가 줄 하나만 봐서는 복원되지 않기 때문이다.
 */
@Entity('env_config_transitions')
@Index('idx_env_config_transitions_config_at', ['env_config_id', 'created_at'])
export class EnvConfigTransition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  env_config_id!: string;

  /** 최초 생성(→ generated)은 직전이 없어 null이다. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  from_status!: BuildStatus | null;

  @Column({ type: 'varchar', length: 20 })
  to_status!: BuildStatus;

  /**
   * 이 전이를 일으킨 사람. **Policy Gate의 자동 판정은 null이다** — 기계가 한 일에
   * 사람 이름을 적으면 감사 기록이 거짓이 된다. 화면은 null을 "시스템"으로 읽는다.
   * 사용자가 삭제돼도 이력은 남아야 하므로 SET NULL이다.
   */
  @Column({ type: 'uuid', nullable: true })
  actor_user_id!: string | null;

  /** 왜 그렇게 됐는가. 차단 사유처럼 상태만으로 설명되지 않는 것을 담는다. */
  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => ProjectEnvConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'env_config_id' })
  env_config!: ProjectEnvConfig;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: User | null;
}
