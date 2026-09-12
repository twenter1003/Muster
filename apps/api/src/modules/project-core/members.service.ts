import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '../../database/inject-repository.decorator';
import { ProjectMember } from '../../database/entities';

/**
 * 응답에 실리는 멤버 표현.
 *
 * **email을 싣지 않는다.** 화면이 필요로 하는 것은 "누가 이 프로젝트에 있는가"이고 거기에는
 * github_login으로 충분하다. 이메일은 멤버 목록을 볼 수 있는 모든 사람에게 연락처를 나눠
 * 주는 것이라, 목록을 보여 주려고 함께 내보낼 이유가 없다.
 */
export interface ProjectMemberView {
  user_id: string;
  github_login: string;
  role: string;
  joined_at: string;
}

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
  ) {}

  /**
   * 프로젝트의 멤버 전원.
   *
   * 페이지네이션이 없다. 이 목록의 용도는 설정 화면의 "owner 1 · member 3" 같은 요약과
   * 전원 나열이라, 커서를 태우면 화면이 역할별 수를 세기 위해 모든 페이지를 훑어야 한다.
   * 프로젝트 하나의 멤버가 페이지를 넘길 만큼 늘어나는 상황은 이 제품의 전제(개인·소규모
   * 사이드 프로젝트)가 아니다. 전제가 깨지면 그때 커서를 붙이는 편이 싸다.
   */
  async listByProject(projectId: string): Promise<ProjectMemberView[]> {
    const rows = await this.members
      .createQueryBuilder('m')
      // 사용자 이름을 같은 쿼리로 가져온다. 행마다 사용자를 다시 읽으면 N+1이다.
      .innerJoin('m.user', 'u')
      .select('m.user_id', 'user_id')
      .addSelect('m.role', 'role')
      .addSelect('m.joined_at', 'joined_at')
      .addSelect('u.github_login', 'github_login')
      // owner를 먼저 세운다 — 'member' < 'owner' 이므로 역순이다. 같은 역할 안에서는
      // 합류 순. 정렬이 흔들리면 같은 목록을 두 번 열었을 때 순서가 바뀐다.
      .where('m.project_id = :projectId', { projectId })
      .orderBy('m.role', 'DESC')
      .addOrderBy('m.joined_at', 'ASC')
      .getRawMany<{ user_id: string; role: string; joined_at: Date; github_login: string }>();

    return rows.map((r) => ({
      user_id: r.user_id,
      github_login: r.github_login,
      role: r.role,
      joined_at: r.joined_at.toISOString(),
    }));
  }
}
