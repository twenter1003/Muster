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
import { User } from './user.entity';

/**
 * 사용자 행위 감사 기록.
 *
 * project_id는 nullable이다 — 로그인/로그아웃, 템플릿 CRUD처럼 프로젝트 스코프가 아닌
 * 행위도 감사 대상이기 때문 (Part 3 설계 결정). Part 4 §8의 조회 API가
 * 프로젝트 스코프(`/projects/:id/audit-logs`)와 전체(`/audit-logs`)로 나뉘는 근거다.
 *
 * project_id FK에 CASCADE를 걸지 않는다 — 프로젝트가 지워졌다고 감사 기록이 사라지면
 * 감사 추적 목적 자체가 무너진다. 프로젝트는 어차피 soft delete라 행이 남지만,
 * 물리 삭제가 발생하더라도 감사 기록은 보존되도록 SET NULL로 둔다.
 *
 * action은 enum이 아니라 varchar다. 엔드포인트가 늘어날 때마다 타입을 고치는 대신
 * `<리소스>.<동작>` 규약(예: project.create, env_config.approve)을 코드 레벨에서 관리한다.
 */
@Entity('audit_logs')
@Index('idx_audit_logs_user_created', ['user_id', 'created_at'])
@Index('idx_audit_logs_project_created', ['project_id', 'created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid', nullable: true })
  project_id!: string | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.audit_logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;
}
