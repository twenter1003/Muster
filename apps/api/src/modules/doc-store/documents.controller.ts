import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { toPageRequest, type Page } from '../../common/pagination/paginate';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
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

/** 설계서 Part 4 §4 — DocStore. 프로젝트 하위 경로. */
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

  /** 메타데이터 생성 + 업로드용 signed URL 발급. 파일은 클라이언트가 GCS로 직접 올린다. */
  @Post(':id/documents')
  @UseGuards(ProjectMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id') projectId: string,
    @Body() dto: CreateDocumentDto,
  ): Promise<DocumentView & { upload_url: string; upload_expires_at: string }> {
    const result = await this.documents.create(projectId, dto);
    return {
      ...toView(result.document),
      upload_url: result.upload_url,
      upload_expires_at: result.upload_expires_at.toISOString(),
    };
  }
}

/** 설계서 Part 4 §4 — 문서 단위 경로. 접근 제어는 서비스가 문서 → 프로젝트로 거슬러 확인한다. */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentView> {
    return toView(await this.documents.complete(id, user.id));
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentView & { download_url: string | null; download_expires_at: string | null }> {
    const result = await this.documents.detail(id, user.id);
    return {
      ...toView(result.document),
      download_url: result.download_url,
      download_expires_at: result.download_expires_at?.toISOString() ?? null,
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDocumentDto,
  ): Promise<DocumentView> {
    return toView(await this.documents.update(id, user.id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.documents.remove(id, user.id);
  }
}
