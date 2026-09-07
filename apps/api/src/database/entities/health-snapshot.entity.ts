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
 * 각 점수는 Elite/High/Medium/Low를 4/3/2/1로 매핑한 값이다.
 * 개별 점수는 nullable이다 — 설계서 Part 2 §6.4가 "데이터가 부족한 지표는 점수 산정에서
 * 제외하고 남은 지표만으로 평균한다"고 정했기 때문이다. NOT NULL이면 그 규칙을 표현할 수 없다.
 * composite_score는 남은 지표의 평균이므로 항상 값이 있다(4개 모두 없으면 스냅샷을 만들지 않는다).
 */
@Entity('health_snapshots')
@Index('idx_health_snapshots_project_measured', ['project_id', 'measured_at'])
export class HealthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'smallint', nullable: true })
  deploy_freq_score!: number | null;

  @Column({ type: 'smallint', nullable: true })
  lead_time_score!: number | null;

  @Column({ type: 'smallint', nullable: true })
  change_fail_score!: number | null;

  @Column({ type: 'smallint', nullable: true })
  mttr_score!: number | null;

  /** 4개 점수의 평균이므로 1.00 ~ 4.00. */
  @Column({ type: 'numeric', precision: 3, scale: 2 })
  composite_score!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  measured_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
