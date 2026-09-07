import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { AgentRun } from './agent-run.entity';

/** 에이전트 설정(md). Part 1 §3.3 */
@Entity('agents')
@Index('idx_agents_project', ['project_id'])
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text' })
  config_md!: string;

  /** ERD에는 updated_at만 있으나, 목록 정렬·커서 페이지네이션 기준으로 created_at도 필요하다. */
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @OneToMany(() => AgentRun, (run) => run.agent)
  runs!: AgentRun[];
}
