import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 재사용 가능한 스택/도커 프리셋.
 * 프로젝트가 아니라 사용자에게 귀속된다 — 여러 프로젝트에서 재사용되고,
 * 수정/삭제 권한 검사의 근거가 필요하기 때문 (Part 3 설계 결정).
 */
@Entity('env_templates')
@Index('idx_env_templates_owner', ['owner_id'])
export class EnvTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  owner_id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'jsonb' })
  stack_preset!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  docker_preset!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.env_templates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;
}
