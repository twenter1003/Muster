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
 * 세션 토큰. Part 4 §2의 "로그아웃 시 즉시 무효화" 계약을 지키기 위한 서버 세션.
 *
 * 원문 토큰은 저장하지 않는다 — DB가 유출돼도 세션을 탈취당하지 않도록 해시만 둔다
 * (Part 2 §6.2의 "평문 저장 금지" 원칙을 세션에도 적용).
 */
@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  /** 매 요청마다 조회되는 경로라 유니크 인덱스가 사실상 필수. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  /** 로그아웃 시각. null이 아니면 만료 전이라도 401. */
  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  /** ERD에는 없으나, 세션 목록·이상 로그인 추적에 필요해 추가한다. */
  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
