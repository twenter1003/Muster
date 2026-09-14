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

/** `analyzeProgress`가 만드는 "남은 작업" 한 항목. */
export interface RemainingItem {
  title: string;
  description: string;
}

/**
 * 확정된 목표(PROJECT_GOALS)와 커밋 이력을 Gemini에 함께 넘겨 만든 진행률 스냅샷의
 * 시계열. `HealthSnapshot`과 같은 모양(insert-only 이력, 조회는 항상 최신 1건)이다 —
 * 분석마다 새 행을 쌓아 재계산이 아니라 적재로 다룬다.
 */
@Entity('project_progress_snapshots')
@Index('idx_project_progress_project_analyzed', ['project_id', 'analyzed_at'])
export class ProjectProgressSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'smallint' })
  percent!: number;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'jsonb' })
  remaining_items!: RemainingItem[];

  /** 분석 시점 HEAD 커밋. 다음 분석과 비교하거나 "이 이후 커밋" UI에 쓸 수 있다. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  based_on_commit_sha!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  analyzed_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
