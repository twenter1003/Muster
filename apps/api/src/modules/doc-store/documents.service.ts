import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Document, ProjectMember } from '../../database/entities';
import type { UploadStatus } from '../../database/entities/enums';
import { ApiException } from '../../common/errors/api.exception';
import { buildPage, type Page, type PageRequest } from '../../common/pagination/paginate';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { UpdateDocumentDto } from './dto/update-document.dto';

export interface DocumentWithUpload {
  document: Document;
  upload_url: string;
  upload_expires_at: Date;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * 설계서 Part 4 §4 — 프로젝트 문서 목록.
   *
   * `upload_status` 필터를 받는다. 설계서는 `completed`만 노출하라고 했지만,
   * 그러면 업로드에 실패한 문서를 열지도 지우지도 못한다 (DESIGN_DRIFT.md 5번).
   * 기본값은 전체이고, 클라이언트가 골라서 거른다.
   */
  async listForProject(
    projectId: string,
    page: PageRequest,
    filters: { type?: string; upload_status?: UploadStatus },
  ): Promise<Page<Document>> {
    const qb = this.documents
      .createQueryBuilder('d')
      .where('d.project_id = :projectId', { projectId })
      .orderBy('d.created_at', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .take(page.limit + 1);

    if (filters.type) qb.andWhere('d.type = :type', { type: filters.type });
    if (filters.upload_status) {
      qb.andWhere('d.upload_status = :status', { status: filters.upload_status });
    }

    if (page.after) {
      qb.andWhere('(d.created_at, d.id) < (:ts, :id)', {
        ts: page.after.ts,
        id: page.after.id,
      });
    }

    const rows = await qb.getMany();
    return buildPage(rows, page.limit, (d) => ({ ts: d.created_at.toISOString(), id: d.id }));
  }

  /**
   * 설계서 Part 4 §4 — 메타데이터 생성 + 업로드용 signed URL 발급.
   *
   * 순서가 중요하다: DB에 먼저 쓰고 그 id로 객체 경로를 만든다. 반대로 하면 경로를
   * 미리 만들어야 하는데, 그러면 레코드 없는 객체가 생길 수 있고 그건 아무도 못 지운다.
   * 반대 방향의 고아(레코드만 있고 객체 없음)는 pending 상태로 남아 정리 배치가 걷어낸다.
   */
  async create(projectId: string, dto: CreateDocumentDto): Promise<DocumentWithUpload> {
    const document = await this.documents.save(
      this.documents.create({
        project_id: projectId,
        title: dto.title,
        type: dto.type,
        commit_ref: dto.commit_ref ?? null,
        upload_status: 'pending',
        file_url: null,
      }),
    );

    const objectPath = objectPathOf(projectId, document.id);

    try {
      const { url, expiresAt } = await this.storage.createUploadUrl({
        objectPath,
        contentType: dto.content_type,
      });

      // 경로는 URL 발급이 성공한 뒤에 기록한다. 발급이 실패했는데 경로만 남으면
      // 완료 확인 단계가 존재하지 않는 객체를 찾으러 간다.
      document.file_url = objectPath;
      await this.documents.save(document);

      return { document, upload_url: url, upload_expires_at: expiresAt };
    } catch (error) {
      // URL을 못 주면 클라이언트는 업로드를 시작할 수 없다. 빈 레코드를 남기지 않는다.
      await this.documents.delete({ id: document.id }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * 설계서 Part 4 §4 — 업로드 완료 확인. pending → completed.
   *
   * 클라이언트 주장을 그대로 믿지 않고 객체가 실제로 있는지 확인한다. 확인 없이 전이하면
   * 업로드가 실패했는데 completed가 되어 조회 시 깨진 링크가 된다 — 완료 확인 단계를
   * 둔 이유 자체가 그것이다.
   */
  async complete(documentId: string, userId: string): Promise<Document> {
    const document = await this.findAccessibleOrFail(documentId, userId);

    if (document.upload_status === 'completed') return document;

    if (!document.file_url || !(await this.storage.exists(document.file_url))) {
      throw ApiException.validationFailed(
        '업로드된 파일을 찾을 수 없습니다. 발급받은 URL로 업로드를 먼저 끝내 주세요.',
      );
    }

    document.upload_status = 'completed';
    return this.documents.save(document);
  }

  /**
   * 설계서 Part 4 §4 — 문서 상세 + 조회용 signed URL.
   * pending 문서도 돌려준다(DESIGN_DRIFT.md 5번). 파일이 아직 없으므로 URL은 null이다.
   */
  async detail(
    documentId: string,
    userId: string,
  ): Promise<{ document: Document; download_url: string | null; download_expires_at: Date | null }> {
    const document = await this.findAccessibleOrFail(documentId, userId);

    if (document.upload_status !== 'completed' || !document.file_url) {
      return { document, download_url: null, download_expires_at: null };
    }

    const { url, expiresAt } = await this.storage.createDownloadUrl({
      objectPath: document.file_url,
    });
    return { document, download_url: url, download_expires_at: expiresAt };
  }

  /** 설계서 Part 4 §4 — 메타데이터 수정. */
  async update(documentId: string, userId: string, dto: UpdateDocumentDto): Promise<Document> {
    const document = await this.findAccessibleOrFail(documentId, userId);

    if (dto.title !== undefined) document.title = dto.title;
    if (dto.type !== undefined) document.type = dto.type;
    // undefined는 "안 건드림", null은 "연결 끊기"로 구분한다.
    if (dto.commit_ref !== undefined) document.commit_ref = dto.commit_ref;

    return this.documents.save(document);
  }

  /**
   * 설계서 Part 4 §4 — 문서 삭제. GCS 객체도 함께 지운다.
   *
   * 객체를 먼저 지우고 레코드를 지운다. 반대로 하면 레코드가 사라진 뒤 객체 삭제가
   * 실패했을 때 그 객체를 가리키는 것이 아무것도 없어 영영 남는다.
   */
  async remove(documentId: string, userId: string): Promise<void> {
    const document = await this.findAccessibleOrFail(documentId, userId);

    if (document.file_url) {
      // 없는 객체를 지우는 것은 실패가 아니다 — 업로드가 시작조차 안 됐을 수 있다.
      await this.storage.delete(document.file_url);
    }

    await this.documents.delete({ id: document.id });
  }

  /**
   * 문서 단위 접근 제어.
   *
   * ProjectMemberGuard는 경로의 `:id`가 프로젝트일 때만 쓸 수 있는데 `/documents/:id`는
   * 문서 id다. 그래서 여기서 문서 → 프로젝트 → 멤버십을 직접 확인한다.
   * 비멤버에게는 404를 준다 — 403은 "그 문서는 존재한다"를 알려주기 때문이다.
   */
  private async findAccessibleOrFail(documentId: string, userId: string): Promise<Document> {
    const document = await this.documents.findOneBy({ id: documentId });
    if (!document) throw ApiException.notFound('문서를 찾을 수 없습니다.');

    const isMember = await this.members.countBy({
      project_id: document.project_id,
      user_id: userId,
    });
    if (!isMember) throw ApiException.notFound('문서를 찾을 수 없습니다.');

    return document;
  }
}

/**
 * GCS 객체 경로. 프로젝트로 묶어 두면 나중에 프로젝트 단위 정리·용량 집계를 접두사로 할 수 있다.
 * 문서 id가 경로에 있으므로 제목이 바뀌어도 객체를 옮길 필요가 없다.
 */
export function objectPathOf(projectId: string, documentId: string): string {
  return `projects/${projectId}/documents/${documentId}`;
}
