import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * 프로젝트 단위 토큰/비용 예산. Part 1 §3.3이 "프로젝트별"로 명시했고,
 * 에이전트 단위 예산은 요구사항에 없다 (Part 3 설계 결정 — API를 PRD에 맞춰 정정).
 *
 * 프로젝트당 최대 1개(1:1)이므로 project_id에 유니크를 건다.
 */
@Entity('project_budgets')
export class ProjectBudget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 유니크 제약은 @OneToOne + @JoinColumn이 생성한다 (여기에 unique를 또 걸면 인덱스가 중복된다). */
  @Column({ type: 'uuid' })
  project_id!: string;

  /** null이면 토큰 한도 없음. */
  @Column({ type: 'bigint', nullable: true })
  token_limit!: string | null;

  /** null이면 비용 한도 없음. AGENT_RUNS.cost와 같은 정밀도. */
  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true })
  cost_limit!: string | null;

  /** 한도의 몇 %에서 알림을 띄울지. 기본 80%. */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 80 })
  alert_threshold_pct!: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @OneToOne(() => Project, (project) => project.budget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
