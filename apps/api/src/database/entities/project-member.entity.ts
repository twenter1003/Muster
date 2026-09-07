import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { MEMBER_ROLES, type MemberRole } from './enums';
import { Project } from './project.entity';
import { User } from './user.entity';

/** USERS ↔ PROJECTS 다대다. 같은 사용자가 한 프로젝트에 두 번 들어갈 수 없다. */
@Entity('project_members')
@Unique('uq_project_members_project_user', ['project_id', 'user_id'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 20, default: MEMBER_ROLES[1] })
  role!: MemberRole;

  @CreateDateColumn({ type: 'timestamptz' })
  joined_at!: Date;

  @ManyToOne(() => Project, (project) => project.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => User, (user) => user.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
