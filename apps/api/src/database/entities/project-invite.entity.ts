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
 * 프로젝트 초대 링크.
 *
 * **왜 "GitHub 계정을 지정해 초대"가 아니라 링크인가.**
 * 계정 지정 방식은 상대가 이미 한 번 로그인해 USERS에 행이 있어야 성립한다. 그래서 "먼저
 * 로그인해 보라 → 네 계정명이 뭐냐 → 초대했다"는 세 번의 왕복이 생기는데, 이 기능이 필요한
 * 이유가 애초에 "남에게 보여 주는 것"이라 그 왕복이 곧 기능의 실패다. 링크는 한 번 건네면
 * 끝난다.
 *
 * **왜 member만 주는가.**
 * 초대는 링크라서, 링크가 새면 받은 사람이 곧 권한이다. owner를 링크로 줄 수 있게 하면
 * 유출 한 번에 프로젝트의 소유권이 넘어간다. owner를 늘리는 것은 링크로 할 일이 아니라
 * 사람을 특정해서 하는 일이라, 그 경로는 여기 두지 않았다(role 컬럼 자체가 없는 이유다).
 *
 * **토큰은 해시만 저장한다.** 세션·API 키와 같은 이유다 — DB 덤프만으로는 링크를 복원할 수
 * 없어야 한다. 그래서 발급 직후 한 번만 원문을 보여 준다.
 */
@Entity('project_invites')
@Index('idx_project_invites_project', ['project_id'])
export class ProjectInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  /** SHA-256. 매 수락마다 조회되는 경로라 유니크 인덱스를 둔다. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token_hash!: string;

  /**
   * 링크를 만든 사람. 초대받은 쪽 화면이 "누가 불렀는지"를 보여 주기 위해 필요하다 —
   * 모르는 프로젝트로 들어오라는 링크는 그것만으로 수상하다.
   * 만든 사람이 지워져도 링크의 기록은 남아야 하므로 SET NULL이다.
   */
  @Column({ type: 'uuid', nullable: true })
  created_by!: string | null;

  /**
   * 만료 시각. **nullable이 아니다** — 기한 없는 초대 링크는 한 번 새면 영원히 유효하고,
   * 그 사실을 아무도 눈치채지 못한다. 만드는 쪽이 기한을 정하지 않아도 기본값이 붙는다.
   */
  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  /** 폐기 시각. null이 아니면 더 이상 수락할 수 없다. */
  @Column({ type: 'timestamptz', nullable: true })
  revoked_at!: Date | null;

  /**
   * 이 링크로 실제로 합류한 사람 수.
   *
   * 여러 번 쓸 수 있는 링크라서 이 숫자가 필요하다 — 두 사람에게 보냈는데 다섯이
   * 들어왔다면 링크가 샌 것이고, 그걸 알 방법이 이것뿐이다.
   */
  @Column({ type: 'integer', default: 0 })
  accepted_count!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;
}
