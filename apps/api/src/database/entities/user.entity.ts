import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Session } from './session.entity';
import { EnvTemplate } from './env-template.entity';
import { ProjectMember } from './project-member.entity';
import { AuditLog } from './audit-log.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** GitHub 계정이 이메일을 비공개로 두면 OAuth 응답에 없을 수 있어 nullable. */
  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 39 })
  github_login!: string;

  /**
   * GitHub 액세스 토큰의 Secret Manager 참조. 토큰 원문은 DB에 두지 않는다
   * (설계서 Part 2 §6.2). 웹훅 자동 등록에 필요하며, ERD에 없던 컬럼이라 Phase 3에서 추가했다.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  github_token_ref!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @OneToMany(() => Session, (session) => session.user)
  sessions!: Session[];

  @OneToMany(() => EnvTemplate, (template) => template.owner)
  env_templates!: EnvTemplate[];

  @OneToMany(() => ProjectMember, (member) => member.user)
  memberships!: ProjectMember[];

  @OneToMany(() => AuditLog, (log) => log.user)
  audit_logs!: AuditLog[];
}
