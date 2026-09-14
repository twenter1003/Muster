import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * 프로젝트당 1행 — 확정된 목표/요구사항 문서. `content_md`가 null이면 아직 확정한 적이
 * 없다는 뜻이다("목표를 먼저 확정해 주세요" 판정 기준).
 *
 * AI가 만든 초안은 여기 저장되지 않는다 — `POST .../goals/draft`는 그 자리에서 만든
 * 텍스트를 응답으로만 돌려주고, 사용자가 "저장"을 눌러야만(수정했든 안 했든) 이 행이
 * 갱신된다. 편집 중인 텍스트는 화면 로컬 상태로 충분하고, 서버가 미확정 버전을 따로
 * 들고 있을 이유가 없다 — 확정본 하나만 진실로 둔다.
 */
@Entity('project_goals')
export class ProjectGoals {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'text', nullable: true })
  content_md!: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @OneToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
