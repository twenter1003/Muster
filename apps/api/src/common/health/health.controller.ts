import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

/**
 * Cloud Run 기동 확인용. 인증 없이 접근 가능해야 하므로 @Public.
 * Phase 2에서 DB 연결 상태 검사를 추가한다.
 */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', uptime_seconds: Math.floor(process.uptime()) };
  }
}
