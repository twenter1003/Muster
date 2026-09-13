import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { Agent, Document, Project, ProjectMember } from '../../database/entities';

/**
 * 한 종류에서 돌려줄 최대 건수.
 *
 * 이 검색은 상단바에서 "그 프로젝트로 건너뛰기" 위한 것이지 목록을 훑기 위한 것이 아니다.
 * 그래서 페이지네이션이 없고, 대신 종류마다 따로 자른다 — 한 종류에 다 먹히면 문서 20건
 * 때문에 찾던 프로젝트가 안 보이는 일이 생긴다.
 */
const PER_KIND_LIMIT = 5;

export type SearchKind = 'project' | 'document' | 'agent';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  /** 매칭된 이름·제목. 강조는 화면이 한다 — 서버가 HTML을 만들어 보내지 않는다. */
  title: string;
  project_id: string;
  project_name: string;
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
  /** 종류별로 상한에 걸렸는가. 걸렸다는 사실이 화면에 보여야 "이게 전부"로 읽지 않는다. */
  truncated: Record<SearchKind, boolean>;
}

/**
 * 상단바 검색 — 프로젝트·문서·에이전트를 이름으로 찾는다.
 *
 * **왜 전문 검색(tsvector)이 아니라 부분 문자열(ILIKE)인가.**
 * 대상이 전부 짧은 이름과 제목이다(프로젝트 이름, 문서 제목, 에이전트 이름). 사람이 여기서
 * 기대하는 것은 "kiosk를 치면 kiosk-pos가 나온다"는 부분 일치이고, 그건 형태소 단위로 자르는
 * 전문 검색이 오히려 못 하는 일이다 — `kiosk-pos`는 한 토큰이라 `kiosk`로는 걸리지 않는다.
 * 게다가 이 제품의 문서 제목은 대부분 한국어인데, Postgres 기본 설정에는 한국어 형태소
 * 분석기가 없어 `simple` 설정으로는 띄어쓰기 단위로만 쪼개진다. 본문 검색이 필요해지면
 * 그때 tsvector를 도입해야 하고, 그건 이 화면이 아니라 DocStore의 일이다.
 *
 * 규모에 대하여: ILIKE '%…%'는 인덱스를 타지 못한다. 지금 대상은 한 사용자가 속한 프로젝트의
 * 이름·제목이라 수백 행 수준이고, 범위 질의가 그 앞에서 이미 잘라 준다. 행이 자릿수로
 * 늘어나면 pg_trgm GIN 인덱스를 얹는 것이 다음 수순이다.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(Agent) private readonly agents: Repository<Agent>,
  ) {}

  async search(userId: string, rawQuery: string): Promise<SearchResult> {
    const query = rawQuery.trim();

    // 범위를 **먼저** 좁힌다. 검색은 특히 위험한 자리다 — 한 글자만 쳐도 남의 프로젝트
    // 이름이 통째로 쏟아질 수 있는 모양이기 때문이다.
    const scope = await this.memberProjects(userId);
    const ids = [...scope.keys()];

    const empty: SearchResult = {
      query,
      hits: [],
      truncated: { project: false, document: false, agent: false },
    };

    // IN ()은 문법 오류다. 멤버인 프로젝트가 없으면 질의하지 않는다.
    if (query.length === 0 || ids.length === 0) return empty;

    const pattern = `%${escapeLike(query)}%`;

    const [projects, documents, agents] = await Promise.all([
      this.projects
        .createQueryBuilder('p')
        .select(['p.id AS id', 'p.name AS title'])
        .where('p.id IN (:...ids)', { ids })
        .andWhere('p.name ILIKE :pattern ESCAPE :esc', { pattern, esc: ESCAPE_CHAR })
        .orderBy('p.updated_at', 'DESC')
        .limit(PER_KIND_LIMIT + 1)
        .getRawMany<{ id: string; title: string }>(),

      this.documents
        .createQueryBuilder('d')
        .select(['d.id AS id', 'd.title AS title', 'd.project_id AS project_id'])
        .where('d.project_id IN (:...ids)', { ids })
        .andWhere('d.title ILIKE :pattern ESCAPE :esc', { pattern, esc: ESCAPE_CHAR })
        .orderBy('d.created_at', 'DESC')
        .limit(PER_KIND_LIMIT + 1)
        .getRawMany<{ id: string; title: string; project_id: string }>(),

      this.agents
        .createQueryBuilder('a')
        .select(['a.id AS id', 'a.name AS title', 'a.project_id AS project_id'])
        .where('a.project_id IN (:...ids)', { ids })
        .andWhere('a.name ILIKE :pattern ESCAPE :esc', { pattern, esc: ESCAPE_CHAR })
        .orderBy('a.created_at', 'DESC')
        .limit(PER_KIND_LIMIT + 1)
        .getRawMany<{ id: string; title: string; project_id: string }>(),
    ]);

    const name = (projectId: string) => scope.get(projectId) ?? '';

    return {
      query,
      hits: [
        // 프로젝트를 먼저 세운다. "kiosk"를 쳤을 때 찾는 것은 대개 그 프로젝트이지
        // 그 안의 문서가 아니다.
        ...projects.slice(0, PER_KIND_LIMIT).map((p) => ({
          kind: 'project' as const,
          id: p.id,
          title: p.title,
          project_id: p.id,
          project_name: p.title,
        })),
        ...documents.slice(0, PER_KIND_LIMIT).map((d) => ({
          kind: 'document' as const,
          id: d.id,
          title: d.title,
          project_id: d.project_id,
          project_name: name(d.project_id),
        })),
        ...agents.slice(0, PER_KIND_LIMIT).map((a) => ({
          kind: 'agent' as const,
          id: a.id,
          title: a.title,
          project_id: a.project_id,
          project_name: name(a.project_id),
        })),
      ],
      // 상한보다 하나 더 받아서 "더 있는가"를 안다. COUNT를 따로 세면 질의가 배로 는다.
      truncated: {
        project: projects.length > PER_KIND_LIMIT,
        document: documents.length > PER_KIND_LIMIT,
        agent: agents.length > PER_KIND_LIMIT,
      },
    };
  }

  /**
   * 요청자가 멤버인, 살아 있는 프로젝트의 id→이름.
   *
   * Reports·Inbox가 각자 같은 질의를 들고 있다. 공용으로 빼지 않는 이유는 inbox.module.ts의
   * 주석에 적어 두었다 — 스무 줄짜리 질의를 각자 들고 있는 편이 경계가 분명하다.
   */
  private async memberProjects(userId: string): Promise<Map<string, string>> {
    const rows = await this.members
      .createQueryBuilder('m')
      // soft delete된 프로젝트를 조인 조건에서 떨군다. 별도 WHERE로 두면 조건을 빠뜨렸을 때
      // 삭제된 프로젝트가 조용히 결과에 들어온다.
      .innerJoin(Project, 'p', 'p.id = m.project_id AND p.deleted_at IS NULL')
      .select('m.project_id', 'project_id')
      .addSelect('p.name', 'name')
      .where('m.user_id = :userId', { userId })
      .getRawMany<{ project_id: string; name: string }>();

    return new Map(rows.map((r) => [r.project_id, r.name]));
  }
}

/** LIKE 패턴에서 특수 의미를 갖는 문자. */
export const ESCAPE_CHAR = '\\';

/**
 * 사용자가 친 글자를 LIKE 패턴의 **리터럴**로 만든다.
 *
 * 이스케이프하지 않으면 `%` 한 글자가 "전부"를 뜻하게 되어, 그 한 글자로 자기가 속한 모든
 * 프로젝트의 문서 제목이 쏟아진다. `_`도 임의의 한 글자라 같은 문제가 작게 생긴다.
 * 이스케이프 문자 자신을 먼저 치환해야 한다 — 나중에 하면 앞서 넣은 백슬래시를 다시 이스케이프한다.
 */
export function escapeLike(value: string): string {
  return value
    .replaceAll(ESCAPE_CHAR, ESCAPE_CHAR + ESCAPE_CHAR)
    .replaceAll('%', ESCAPE_CHAR + '%')
    .replaceAll('_', ESCAPE_CHAR + '_');
}
