import { Injectable, Logger } from '@nestjs/common';
import { ApiException, type ApiErrorBody } from '../../common/errors/api.exception';
import { GitIntegrationService } from './git-integration.service';
import { ProjectsService } from './projects.service';
import { repoUrlOf } from './repo-url';

export interface ImportResultItem {
  full_name: string;
  status: 'created' | 'failed';
  project_id?: string;
  error?: string;
}

/**
 * 레포 가져오기(온보딩) — 사용자가 고른 레포마다 "프로젝트 생성 + Git 연동"을
 * 한 클릭으로 묶는다. 실제로는 두 단계 그대로다: `ProjectsService.create`와
 * `GitIntegrationService.connect`를 이미 검증된 순서로 부를 뿐이다.
 *
 * 레포 하나씩 순서대로 처리하고 한 레포의 실패가 다른 레포를 막지 않는다.
 * 로컬 개발 환경처럼 웹훅 수신 주소가 공개 인터넷에서 안 닿는 경우 전부 실패할 수 있는데,
 * 그때도 "몇 개 중 몇 개가 됐는지"를 사용자가 알아야지 전체를 500으로 떨어뜨리면 안 된다.
 */
@Injectable()
export class ProjectImportService {
  private readonly logger = new Logger(ProjectImportService.name);

  constructor(
    private readonly projects: ProjectsService,
    private readonly gitIntegrations: GitIntegrationService,
  ) {}

  async import(userId: string, fullNames: string[]): Promise<ImportResultItem[]> {
    const results: ImportResultItem[] = [];

    for (const fullName of fullNames) {
      results.push(await this.importOne(userId, fullName));
    }

    return results;
  }

  private async importOne(userId: string, fullName: string): Promise<ImportResultItem> {
    const name = fullName.split('/').at(-1) ?? fullName;

    // 프로젝트는 만들어졌는데 연동이 실패하는 경우가 있다(웹훅 등록 실패 등).
    // 그 프로젝트를 지우지 않는다 — GitIntegrationService.connect가 웹훅 실패 시
    // 자기가 만든 웹훅/시크릿을 이미 되돌리므로, 여기서 또 되돌리면 "누가 정리하는지"가
    // 두 곳으로 갈린다. project_id를 응답에 실어 사용자가 나중에 연동을 다시 시도할 수 있게 한다.
    const project = await this.projects.create(userId, { name });

    try {
      await this.gitIntegrations.connect(project.id, userId, repoUrlOf(fullName));
      return { full_name: fullName, status: 'created', project_id: project.id };
    } catch (error) {
      this.logger.warn(`레포 가져오기 중 연동 실패 (${fullName}): ${String(error)}`);
      return {
        full_name: fullName,
        status: 'failed',
        project_id: project.id,
        error:
          error instanceof ApiException
            ? (error.getResponse() as ApiErrorBody).error.message
            : '레포 연동에 실패했습니다.',
      };
    }
  }
}
