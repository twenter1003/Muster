import { Controller, Param, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { ProjectMemberGuard } from '../../common/auth/project-member.guard';
import { StreamService } from './stream.service';

/**
 * 설계서 Part 4 §7.3 — `GET /projects/:id/stream` (SSE).
 *
 * 인증은 다른 조회 API와 같다 (`Authorization: Bearer` + 멤버십). 브라우저의 EventSource는
 * 헤더를 못 싣지만, 토큰을 쿼리스트링으로 받는 건 Part 4 §1의 "개인정보를 URL에 두지 않는다"와
 * 로그 유출 위험 때문에 택하지 않았다 — 프론트엔드는 fetch 기반 SSE 클라이언트를 쓴다.
 */
@Controller('projects')
export class ProjectStreamController {
  constructor(private readonly streams: StreamService) {}

  @Sse(':id/stream')
  @UseGuards(ProjectMemberGuard)
  stream(@Param('id') projectId: string): Observable<MessageEvent> {
    return this.streams.forProject(projectId);
  }
}
