import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PROJECT_STAGES, type ProjectStage } from './enums';
import { ProjectMember } from './project-member.entity';
import { GitIntegration } from './git-integration.entity';
import { ProjectBudget } from './project-budget.entity';

/**
 * 프로젝트 본체.
 *
 * owner_id 컬럼을 두지 않는다 — 소유권은 PROJECT_MEMBERS.role='owner'로 표현한다
 * (Part 3 설계 결정, 멀티유저 확장 시 스키마 변경 회피).
 *
 * 삭제는 soft delete다. @DeleteDateColumn을 쓰면 TypeORM의 모든 find 계열 쿼리가
 * `deleted_at IS NULL`을 자동으로 붙이므로, 필터 누락으로 삭제된 프로젝트가 노출되는
 * 사고를 구조적으로 막는다 (Part 3 설계 결정).
 */
@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: PROJECT_STAGES[0] })
  current_stage!: ProjectStage;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  /** 삭제된 프로젝트만 걸러 GCS 파일을 30일 후 정리하는 배치가 이 컬럼을 읽는다. */
  @Index()
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;

  @OneToMany(() => ProjectMember, (member) => member.project)
  members!: ProjectMember[];

  @OneToOne(() => GitIntegration, (integration) => integration.project)
  git_integration!: GitIntegration | null;

  @OneToOne(() => ProjectBudget, (budget) => budget.project)
  budget!: ProjectBudget | null;
}
