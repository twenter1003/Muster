import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../../common/errors/api.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { GITHUB_API_VERSION } from '../auth/github-oauth.client';
import type { RepoRef } from './repo-url';

export interface CreateWebhookParams extends RepoRef {
  accessToken: string;
  /** 웹훅을 받을 우리 엔드포인트 주소. */
  deliveryUrl: string;
  /** HMAC 서명 생성에 쓰일 시크릿 원문. */
  secret: string;
}

export interface DeleteWebhookParams extends RepoRef {
  accessToken: string;
  hookId: number;
}

export interface DeleteRepoParams extends RepoRef {
  accessToken: string;
}

export interface ListCommitsParams extends RepoRef {
  accessToken: string;
  /** 기본 5 — 프로젝트 상세 화면의 "최근 커밋" 카드가 보여 주는 개수. */
  limit?: number;
}

/** 프로젝트 상세 화면의 "최근 커밋" 카드가 쓰는 필드만 남긴다. */
export interface CommitSummary {
  sha: string;
  /** 커밋 메시지 첫 줄만 — 본문까지 보여 주면 카드 한 줄 높이가 무너진다. */
  message: string;
  authored_at: string | null;
  url: string;
}

export interface ListWorkflowRunsParams extends RepoRef {
  accessToken: string;
  /** 기본 20 — 연동 직후 백필에 쓰는 값이라 커밋보다 넉넉하게 잡는다. */
  limit?: number;
}

export interface ListDocsParams extends RepoRef {
  accessToken: string;
}

/** "목표 초안" 기능이 프롬프트에 이어붙일 문서 하나. */
export interface RepoDoc {
  path: string;
  content: string;
}

/**
 * DEPLOYMENT_EVENTS 한 행이 될 워크플로 실행 하나. `github-events.ts`의 `workflowRun()`이
 * 웹훅 페이로드에서 뽑는 것과 같은 필드·같은 판정 규칙(success/failure만, 나머지는 버림)이다 —
 * 웹훅으로 들어오는 것과 API로 백필하는 것이 같은 모양이어야 두 경로가 섞여도 안전하다.
 */
export interface WorkflowRunSummary {
  status: 'success' | 'failure';
  commit_sha: string;
  committed_at: string | null;
  occurred_at: string;
}

/** GitHub 레포 웹훅 관리 계약. 자격증명 없이도 플로우를 검증할 수 있도록 인터페이스로 둔다. */
export interface GitHubRepoClient {
  createWebhook(params: CreateWebhookParams): Promise<{ id: number }>;
  deleteWebhook(params: DeleteWebhookParams): Promise<void>;
  listCommits(params: ListCommitsParams): Promise<CommitSummary[]>;
  listWorkflowRuns(params: ListWorkflowRunsParams): Promise<WorkflowRunSummary[]>;
  /**
   * 레포 자체를 GitHub에서 영구히 지운다 — 웹훅 해제와는 차원이 다르다. `delete_repo`
   * 스코프가 없으면 403이다("가져온 레포 삭제" 화면이 "Muster에서만 제거"와 "GitHub
   * 레포 자체도 삭제"를 나눠 묻는 이유).
   */
  deleteRepo(params: DeleteRepoParams): Promise<void>;
  /**
   * "목표 초안" 기능이 읽는 문서. README + 루트 `docs/` 폴더의 `.md` 파일(1단계만) —
   * 둘 다 없으면 빈 배열이다. 파일 수·크기 제한은 구현체(`listDocs` 주석)에 있다.
   */
  listDocs(params: ListDocsParams): Promise<RepoDoc[]>;
}

export const GITHUB_REPO_CLIENT = Symbol('GITHUB_REPO_CLIENT');

const MAX_DOC_FILES = 20;
const MAX_DOC_FILE_BYTES = 20_000;
const MAX_DOC_TOTAL_BYTES = 60_000;

/** 파일당·합계 크기 컷오프. `listDocs`의 의도적 축소 주석 참조. */
function capDocs(files: RepoDoc[]): RepoDoc[] {
  const capped: RepoDoc[] = [];
  let totalBytes = 0;

  for (const doc of files) {
    const content =
      doc.content.length > MAX_DOC_FILE_BYTES
        ? doc.content.slice(0, MAX_DOC_FILE_BYTES)
        : doc.content;
    if (totalBytes + content.length > MAX_DOC_TOTAL_BYTES) break;
    capped.push({ path: doc.path, content });
    totalBytes += content.length;
  }

  return capped;
}

/**
 * 구독할 이벤트.
 *
 * 설계서 Part 4 §7.1은 "커밋/PR 이벤트"로 한정했지만 `workflow_run`을 더한다. 환경 구성
 * 실행(Part 4 §5.2)이 그 레포의 Actions에서 돌고, 끝났다는 소식이 이 경로로만 돌아온다.
 * 없으면 실행한 구성이 running에 영영 머문다.
 *
 * **이 목록을 바꿔도 이미 등록된 웹훅은 갱신되지 않는다.** 기존 연동은 해제 후 다시 걸어야
 * workflow_run을 받는다.
 */
export const WEBHOOK_EVENTS = ['push', 'pull_request', 'workflow_run'] as const;

@Injectable()
export class HttpGitHubRepoClient implements GitHubRepoClient {
  private readonly logger = new Logger(HttpGitHubRepoClient.name);

  async createWebhook(params: CreateWebhookParams): Promise<{ id: number }> {
    const res = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/hooks`, {
      method: 'POST',
      headers: this.headers(params.accessToken),
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: [...WEBHOOK_EVENTS],
        config: {
          url: params.deliveryUrl,
          content_type: 'json',
          secret: params.secret,
          insecure_ssl: '0',
        },
      }),
    });

    if (res.status !== 201) {
      throw await this.toApiException(
        res,
        '웹훅 등록에 실패했습니다.',
        // GitHub이 거부하는 실제 사유는 거의 이 둘뿐이다: 수신 주소가 공개 인터넷에서
        // 닿지 않거나(localhost 포함), 같은 주소의 웹훅이 이미 걸려 있거나.
        '웹훅을 등록할 수 없습니다. 수신 주소가 공개 인터넷에서 접근 가능한지, ' +
          '같은 웹훅이 이미 등록돼 있지 않은지 확인해 주세요.',
      );
    }

    const body = (await res.json()) as { id?: number };
    if (typeof body.id !== 'number') {
      throw new ApiException(ErrorCode.INTERNAL, 'GitHub 응답에 웹훅 id가 없습니다.', 502);
    }

    return { id: body.id };
  }

  async deleteWebhook(params: DeleteWebhookParams): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/hooks/${params.hookId}`,
      { method: 'DELETE', headers: this.headers(params.accessToken) },
    );

    // 이미 GitHub에서 지워진 웹훅이면 404가 온다. 연동 해제라는 목적은 달성된 상태라
    // 실패로 취급하지 않는다 — 그렇지 않으면 우리 쪽 레코드를 영영 정리할 수 없다.
    if (res.status === 204 || res.status === 404) return;

    throw await this.toApiException(res, '웹훅 삭제에 실패했습니다.');
  }

  async listCommits(params: ListCommitsParams): Promise<CommitSummary[]> {
    const perPage = params.limit ?? 5;
    const res = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/commits?per_page=${perPage}`,
      { headers: this.headers(params.accessToken) },
    );

    // 커밋이 하나도 없는 빈 레포는 409를 준다 — 실패가 아니라 "아직 없음"이다.
    if (res.status === 409) return [];
    if (!res.ok) throw await this.toApiException(res, '커밋 목록 조회에 실패했습니다.');

    const body = (await res.json()) as Array<{
      sha?: string;
      html_url?: string;
      commit?: { message?: string; author?: { date?: string } };
    }>;

    return body
      .filter((c): c is Required<Pick<typeof c, 'sha'>> & typeof c => Boolean(c.sha))
      .map((c) => ({
        sha: c.sha,
        message: (c.commit?.message ?? '').split('\n')[0],
        authored_at: c.commit?.author?.date ?? null,
        url: c.html_url ?? '',
      }));
  }

  /**
   * 레포를 막 연동했을 때, 그 이후 웹훅만 기다리면 "가져오기 전 이력"이 전부 비어 보인다.
   * `?status=completed`로 끝난 실행만 받아, 웹훅 인터프리터(`github-events.ts`)와 같은
   * success/failure 판정만 남기고 나머지(cancelled·skipped 등)는 버린다.
   */
  async listWorkflowRuns(params: ListWorkflowRunsParams): Promise<WorkflowRunSummary[]> {
    const perPage = params.limit ?? 20;
    const res = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/actions/runs` +
        `?per_page=${perPage}&status=completed`,
      { headers: this.headers(params.accessToken) },
    );

    if (!res.ok) throw await this.toApiException(res, '워크플로 이력 조회에 실패했습니다.');

    const body = (await res.json()) as {
      workflow_runs?: Array<{
        conclusion?: string | null;
        head_sha?: string;
        updated_at?: string;
        head_commit?: { timestamp?: string } | null;
      }>;
    };

    const rows: WorkflowRunSummary[] = [];
    for (const run of body.workflow_runs ?? []) {
      const status =
        run.conclusion === 'success'
          ? 'success'
          : run.conclusion === 'failure' || run.conclusion === 'timed_out'
            ? 'failure'
            : null;
      if (!status || !run.head_sha || !run.updated_at) continue;

      const committedRaw = run.head_commit?.timestamp;
      const committed = committedRaw && committedRaw <= run.updated_at ? committedRaw : null;

      rows.push({
        status,
        commit_sha: run.head_sha,
        committed_at: committed,
        occurred_at: run.updated_at,
      });
    }

    return rows;
  }

  async deleteRepo(params: DeleteRepoParams): Promise<void> {
    const res = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}`, {
      method: 'DELETE',
      headers: this.headers(params.accessToken),
    });

    // 이미 지워진 레포(404)도 성공으로 본다 — 목적(그 레포가 없다)은 이미 달성된 상태다.
    if (res.status === 204 || res.status === 404) return;

    throw await this.toApiException(
      res,
      '레포 삭제에 실패했습니다.',
      undefined,
      res.status === 403
        ? 'GitHub 레포 삭제 권한이 없습니다. 레포 소유자인지, delete_repo 권한으로 다시 로그인했는지 확인해 주세요.'
        : undefined,
    );
  }

  /**
   * README(전용 엔드포인트라 파일명 대소문자·확장자를 몰라도 된다)와 루트 `docs/`
   * 폴더의 `.md` 파일(1단계만, 재귀 없음)을 모은다.
   *
   * **의도적 축소**: 파일 최대 20개, 파일당 20KB·합계 60KB에서 자른다 — 목표 초안을
   * 만드는 Gemini 호출의 프롬프트 크기를 예측 가능하게 유지하기 위해서다(전체 레포를
   * 훑거나 하위 폴더까지 재귀하지 않는다). DESIGN_DRIFT.md 12번 참조.
   */
  async listDocs(params: ListDocsParams): Promise<RepoDoc[]> {
    const { owner, repo, accessToken } = params;
    const files: RepoDoc[] = [];

    const readme = await this.fetchContentFile(owner, repo, accessToken, 'readme');
    if (readme) files.push(readme);

    const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/docs`, {
      headers: this.headers(accessToken),
    });
    if (listRes.status !== 404) {
      if (!listRes.ok) throw await this.toApiException(listRes, '문서 목록 조회에 실패했습니다.');

      const entries = (await listRes.json()) as Array<{
        type?: string;
        name?: string;
        path?: string;
      }>;
      const mdFiles = Array.isArray(entries)
        ? entries.filter((e) => e.type === 'file' && e.name?.toLowerCase().endsWith('.md'))
        : [];

      for (const entry of mdFiles) {
        if (files.length >= MAX_DOC_FILES || !entry.path) break;
        const doc = await this.fetchContentFile(owner, repo, accessToken, `contents/${entry.path}`);
        if (doc) files.push(doc);
      }
    }

    return capDocs(files);
  }

  /** GitHub Contents API에서 파일 하나(README 또는 특정 경로)를 읽는다. 없으면 null. */
  private async fetchContentFile(
    owner: string,
    repo: string,
    accessToken: string,
    apiPath: string,
  ): Promise<RepoDoc | null> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${encodeURI(apiPath)}`, {
      headers: this.headers(accessToken),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await this.toApiException(res, '문서 조회에 실패했습니다.');

    const body = (await res.json()) as { path?: string; content?: string; encoding?: string };
    if (typeof body.content !== 'string' || body.encoding !== 'base64') return null;

    return {
      path: body.path ?? apiPath,
      content: Buffer.from(body.content, 'base64').toString('utf-8'),
    };
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  private async toApiException(
    res: Response,
    message: string,
    invalidRequestMessage?: string,
    /** 401/403 기본 메시지("다시 로그인해 주세요")가 원인을 다 설명하지 못할 때만 넘긴다. */
    forbiddenMessage?: string,
  ): Promise<ApiException> {
    // GitHub의 원문 오류는 토큰 범위 등 내부 정보를 담을 수 있어 로그에만 남긴다.
    const detail = await res.text().catch(() => '');
    this.logger.warn(`GitHub API ${res.status}: ${detail.slice(0, 500)}`);

    if (res.status === 401 || res.status === 403) {
      return ApiException.forbidden(
        forbiddenMessage ?? 'GitHub 권한이 부족합니다. 다시 로그인해 주세요.',
      );
    }
    if (res.status === 404) {
      return ApiException.notFound('레포지토리를 찾을 수 없거나 접근 권한이 없습니다.');
    }
    // 422는 GitHub이 우리 요청을 "형식은 맞지만 받아들일 수 없다"고 거부한 것이다.
    // 서버 장애가 아니므로 502로 뭉뚱그리면 호출자가 고칠 수 있는 문제를 장애로 오인한다.
    // 원문은 노출하지 않되(위 주석 참조) 현실적인 원인은 짚어 준다.
    if (res.status === 422 && invalidRequestMessage) {
      return ApiException.validationFailed(invalidRequestMessage);
    }
    return new ApiException(ErrorCode.INTERNAL, message, 502);
  }
}
