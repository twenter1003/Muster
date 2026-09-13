import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';
import { DATA_SOURCE } from '../../database/database.module';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';

/**
 * Cloud Run 기동 확인용. 인증 없이 접근 가능해야 하므로 @Public.
 *
 * **DB까지 건드린다.** 프로세스가 떠 있는지만 보는 헬스체크는 배포에서 가장 흔한 실패
 * (연결 문자열이 틀렸다·방화벽에 막혔다)를 그대로 통과시킨다. 그러면 "배포는 성공했는데
 * 모든 화면이 500"인 상태가 되고, 원인을 서버 로그에서 찾아야 한다.
 *
 * 무료 Supabase가 7일간 DB 활동이 없으면 프로젝트를 정지시키는데, 주간 깨우기 작업
 * (.github/workflows/keepalive.yml)이 때리는 곳도 여기다. 그래서 **실제 질의**여야 한다 —
 * 프로세스 확인만으로는 DB가 깨어나지 않는다.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; uptime_seconds: number }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      // 원인을 밖으로 내보내지 않는다 — 호스트명·사용자명이 섞여 나온다. 인증 없이 열려
      // 있는 경로라 알려 줄 이유가 없는 것은 알려 주지 않는다. 로그에는 TypeORM이 남긴다.
      throw new ApiException(ErrorCode.INTERNAL, '데이터베이스에 연결할 수 없습니다.', 503);
    }

    return { status: 'ok', uptime_seconds: Math.floor(process.uptime()) };
  }
}
