import type { Repository } from 'typeorm';
import { Project, ProjectMember } from '../../database/entities';

/**
 * 요청자가 멤버인, 살아 있는 프로젝트의 id→이름.
 *
 * DocumentsService·AgentsService·EnvConfigsService·ReportsService도 같은 질의를 각자 들고
 * 있다. 공통 헬퍼 하나로 합치지 않는 이유는 두 가지다.
 *
 * 첫째, common/은 도메인 테이블을 모른다 — 페이지네이션·커서처럼 도메인과 무관한 것만 둔다.
 * PROJECTS/PROJECT_MEMBERS를 읽는 질의를 거기 놓으면 도메인 로직이 한 층 아래로 새고,
 * 그 다음부터는 무엇이든 common/에 들어갈 수 있게 된다.
 *
 * 둘째, 설령 어딘가 도메인 모듈에 뒀더라도 Ingest는 그것을 가져다 쓸 수 없다 — Ingest가
 * 다른 모듈을 import하지 않는다는 규칙(통합설계서 Part 2 §8)을 .eslintrc.js와
 * module-boundary.spec.ts가 강제한다. 그래서 Ingest는 자기 몫의 사본을 직접 소유한다.
 *
 * 엔티티(database/entities)를 직접 질의하는 것은 경계 위반이 아니다 — ReportsService가
 * 하는 것과 같은 일이고, 모듈이 아니라 스키마에 의존하는 것이다.
 */
export async function memberProjects(
  members: Repository<ProjectMember>,
  userId: string,
): Promise<Map<string, string>> {
  const rows = await members
    .createQueryBuilder('m')
    // soft delete된 프로젝트는 조인 조건에서 떨군다. 별도 WHERE로 두면 조건을 빠뜨렸을 때
    // 삭제된 프로젝트의 행이 조용히 목록에 들어온다.
    .innerJoin(Project, 'p', 'p.id = m.project_id AND p.deleted_at IS NULL')
    .select('m.project_id', 'project_id')
    .addSelect('p.name', 'name')
    .where('m.user_id = :userId', { userId })
    .getRawMany<{ project_id: string; name: string }>();

  return new Map(rows.map((r) => [r.project_id, r.name]));
}
