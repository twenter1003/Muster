import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { type ProjectStage } from './enums';
import { Project } from './project.entity';

/**
 * 진행 단계 전환 이력. PROJECTS.current_stage는 현재 상태만 담고
 * 타임라인 시각화(Part 1 §3.4)는 이 테이블이 담당한다.
 */
@Entity('project_stage_history')
@Index('idx_stage_history_project_entered', ['project_id', 'entered_at'])
export class ProjectStageHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'varchar', length: 20 })
  stage!: ProjectStage;

  @CreateDateColumn({ type: 'timestamptz' })
  entered_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
