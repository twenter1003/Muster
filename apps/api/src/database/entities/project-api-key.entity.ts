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
 * 프로젝트 스코프 API 키. 외부에서 도는 에이전트가 로그·실행이력을 밀어넣을 때 쓴다.
 * 사용자 세션 토큰을 에이전트에 심지 않기 위한 것이다 (설계서 Part 3 설계 결정).
 *
 * 세션 토큰과 같은 이유로 원문은 저장하지 않고 SHA-256 해시만 둔다.
 */
@Entity('project_api_keys')
export class ProjectApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  /** 매 요청마다 조회되는 경로라 유니크 인덱스가 사실상 필수다(설계서 미명시). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key_hash!: string;

  /** 어떤 용도의 키인지 사람이 알아보기 위한 이름. 원문을 다시 볼 수 없으므로 이게 유일한 식별 수단이다. */
  @Column({ type: 'varchar', length: 100 })
  label!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  /** 폐기 시각. null이 아니면 인증에 쓸 수 없다. */
  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
