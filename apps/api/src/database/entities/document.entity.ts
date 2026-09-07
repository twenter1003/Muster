import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DOCUMENT_TYPES, type DocumentType } from './enums';
import { Project } from './project.entity';

/** 문서 메타데이터. 원본 파일은 GCS에 있고 여기엔 객체 경로만 둔다 (Part 2 §4.1). */
@Entity('documents')
@Index('idx_documents_project_created', ['project_id', 'created_at'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  project_id!: string;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Column({ type: 'varchar', length: 20, default: DOCUMENT_TYPES[3] })
  type!: DocumentType;

  /**
   * GCS 객체 경로. signed upload URL을 발급한 시점에는 아직 업로드 전이므로 nullable.
   * (업로드 완료 확인 절차는 설계서에 정의되어 있지 않다 — Phase 4 진입 시 결정 필요.)
   */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  file_url!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  commit_ref!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
