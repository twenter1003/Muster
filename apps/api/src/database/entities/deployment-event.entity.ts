import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { type DeploymentKind, type DeploymentStatus } from './enums';
import { Project } from './project.entity';

/**
 * 배포·워크플로 성공/실패 이력. DORA 4지표(Part 2 §6.4)의 **유일한 입력 데이터**다.
 * GitHub `deployment_status`/`workflow_run` 웹훅으로 적재한다 (Part 3 240행, 신설 엔티티).
 *
 * `occurred_at`을 CreateDateColumn으로 두지 않는 이유: 이건 우리가 행을 만든 시각이 아니라
 * **배포가 끝난 시각**이다. 웹훅이 늦게 도착하거나 재전송되면 둘이 벌어지고, 그 차이가
 * 리드타임·MTTR 계산을 그대로 왜곡한다. 페이로드의 시각을 그대로 쓴다.
 *
 * `committed_at`이 nullable인 이유: `workflow_run`은 `head_commit.timestamp`를 주지만
 * `deployment_status` 페이로드에는 커밋 시각이 없다. NOT NULL로 두면 없는 값을 지어내야 하고
 * 그 순간 리드타임 중앙값이 거짓이 된다. null인 행은 리드타임 집계에서만 빠지고
 * 나머지 3지표에는 그대로 쓰인다 (§6.4의 "데이터가 부족한 지표는 제외"와 같은 원칙).
 */
@Entity('deployment_events')
@Index('idx_deployment_events_project_occurred', ['project_id', 'occurred_at'])
export class DeploymentEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: DeploymentKind;

  @Column({ type: 'varchar', length: 10 })
  status!: DeploymentStatus;

  /** git SHA-1은 40자다. 페이로드가 짧은 형태를 주더라도 그대로 보관한다. */
  @Column({ type: 'varchar', length: 40 })
  commit_sha!: string;

  /** 커밋 시각. 리드타임의 시작점 — 페이로드에 없으면 null. */
  @Column({ type: 'timestamptz', nullable: true })
  committed_at!: Date | null;

  /** 배포·워크플로가 끝난 시각. 리드타임의 끝점이자 배포 빈도·MTTR의 기준 시각. */
  @Column({ type: 'timestamptz' })
  occurred_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
