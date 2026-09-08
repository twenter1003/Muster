import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DOCUMENT_TYPES, UPLOAD_STATUSES, type DocumentType, type UploadStatus } from './enums';
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
   * 완료 확인 절차는 설계서 Part 4 §4에 정의돼 있다 — POST /documents/:id/complete.
   */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  file_url!: string | null;

  /**
   * pending: signed upload URL만 발급된 상태. completed: 업로드 완료 확인까지 끝난 상태.
   * pending으로 24시간 지난 문서는 정리 배치가 지운다 (설계서 Part 4 §4).
   */
  @Column({ type: 'varchar', length: 20, default: UPLOAD_STATUSES[0] })
  upload_status!: UploadStatus;

  @Column({ type: 'varchar', length: 40, nullable: true })
  commit_ref!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
