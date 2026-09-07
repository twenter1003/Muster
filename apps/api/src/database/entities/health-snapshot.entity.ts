import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * DORA 4지표 등급 점수 + 종합 점수의 시계열.
 *
 * 지표별 점수를 개별 컬럼으로 두는 이유는 "종합 점수는 낮은데 어느 지표 때문인지"를
 * 대시보드에서 분해해 보여주기 위함이다 (Part 3 설계 결정).
 * 각 점수는 Elite/High/Medium/Low를 4/3/2/1로 매핑한 값이고 composite는 그 평균이다.
 */
@Entity('health_snapshots')
@Index('idx_health_snapshots_project_measured', ['project_id', 'measured_at'])
export class HealthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'smallint' })
  deploy_freq_score!: number;

  @Column({ type: 'smallint' })
  lead_time_score!: number;

  @Column({ type: 'smallint' })
  change_fail_score!: number;

  @Column({ type: 'smallint' })
  mttr_score!: number;

  /** 4개 점수의 평균이므로 1.00 ~ 4.00. */
  @Column({ type: 'numeric', precision: 3, scale: 2 })
  composite_score!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  measured_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
