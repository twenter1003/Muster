import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * GitHub 레포 연동. 프로젝트당 최대 1개(1:1)라 project_id에 유니크를 건다.
 *
 * 웹훅 시크릿 원문은 저장하지 않는다 — Secret Manager의 리소스 이름만 들고 있고
 * 검증 시점에 런타임으로 주입받는다 (Part 2 §6.2 "DB에 평문 저장 금지").
 * 설계서 Part 2 §6.3의 "GIT_INTEGRATIONS에 저장된 시크릿" 표현은 이 참조를 의미하는 것으로 해석했다.
 */
@Entity('git_integrations')
export class GitIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** 유니크 제약은 @OneToOne + @JoinColumn이 생성한다 (여기에 unique를 또 걸면 인덱스가 중복된다). */
  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'varchar', length: 500 })
  repo_url!: string;

  /** 예: projects/muster/secrets/webhook-<project_id>/versions/latest */
  @Column({ type: 'varchar', length: 500 })
  webhook_secret_ref!: string;

  /**
   * GitHub이 발급한 웹훅 id. 연동 해제 시 DELETE /repos/{owner}/{repo}/hooks/{hook_id}에 필요하다.
   * ERD에 없던 컬럼이라 Phase 3에서 추가했다 — 이게 없으면 우리가 만든 웹훅을 지울 방법이 없다.
   * 웹훅 등록에 실패한 채 연동만 남는 경우를 허용하지 않으므로 실제로는 항상 채워지지만,
   * 과거 데이터 호환을 위해 nullable로 둔다.
   */
  @Column({ type: 'bigint', nullable: true })
  webhook_id!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  connected_at!: Date;

  @OneToOne(() => Project, (project) => project.git_integration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
