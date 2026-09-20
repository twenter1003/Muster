import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { DocumentsService } from './documents.service';
import { ListDocumentsQuery } from './dto/list-documents.query';
import type { Document } from '../../database/entities';

/**
 * 응답에 실리는 문서 표현.
 * `file_url`(GCS 객체 경로)은 내보내지 않는다 — 버킷 내부 구조를 드러내고, 클라이언트가
 * 써야 할 것은 경로가 아니라 signed URL이다.
 */
interface DocumentView {
  id: string;
  project_id: string;
  title: string;
  type: string;
  upload_status: string;
  commit_ref: string | null;
  created_at: string;
}

const toView = (d: Document): DocumentView => ({
  id: d.id,
  project_id: d.project_id,
  title: d.title,
  type: d.type,
  upload_status: d.upload_status,
  commit_ref: d.commit_ref,
  created_at: d.created_at.toISOString(),
});

/**
 * 설계서 Part 4 §4 — DocStore.
 *
 * 남은 것은 프로젝트 문서 목록 조회 하나다. 업로드(`POST /projects/:id/documents`)와
 * 문서 단위 경로(`GET /documents`, `GET/PATCH/DELETE /documents/:id`,
 * `POST /documents/:id/complete`)는 업로드 UI와 DocStore 화면이 PR #76에서 삭제되면서
 * 호출자를 잃어 같이 지웠다. 문서 레코드와 GCS 객체는 그대로 있고, 프로젝트 상세 화면이
 * 목록만 읽는다.
 */
@Controller('projects')
export class ProjectDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':id/documents')
  @UseGuards(ProjectMemberGuard)
  async list(
    @Param('id') projectId: string,
    @Query() query: ListDocumentsQuery,
  ): Promise<Page<DocumentView>> {
    const page = await this.documents.listForProject(projectId, toPageRequest(query), {
      type: query.type,
      upload_status: query.upload_status,
    });
    return { items: page.items.map(toView), next_cursor: page.next_cursor };
  }
}
