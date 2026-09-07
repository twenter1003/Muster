import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { type LogLevel } from './enums';
import { Project } from './project.entity';
import { Agent } from './agent.entity';

/**
 * 실행/에러 로그. 가장 빠르게 증가할 테이블이며, 조회 성능이 떨어지면
 * 1순위로 TimescaleDB 하이퍼테이블 전환 대상이다 (Part 3 확장 시 주의점).
 *
 * 인덱스는 조회 API(Part 4 §7.2)의 접근 패턴에 맞춘다:
 * 프로젝트별 최신순 조회 + 레벨 필터.
 */
@Entity('log_entries')
@Index('idx_log_entries_project_created', ['project_id', 'created_at'])
@Index('idx_log_entries_project_level_created', ['project_id', 'level', 'created_at'])
export class LogEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  /** 에이전트가 아니라 웹훅/시스템에서 온 로그면 null. */
  @Column({ type: 'uuid', nullable: true })
  agent_id!: string | null;

  @Column({ type: 'varchar', length: 10 })
  level!: LogLevel;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => Agent, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'agent_id' })
  agent!: Agent | null;
}
