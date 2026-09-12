import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogsController, ProjectAuditController } from './audit.controller';

/**
 * Audit — 설계서 Part 3의 엔티티 담당 모듈 표가 AUDIT_LOGS를 이 모듈에 배정하고 있다.
 *
 * @Global인 이유: 감사 기록은 특정 모듈의 기능이 아니라 횡단 관심사다. 다섯 개 모듈이
 * 전부 AuditModule을 import하게 하면 모듈 그래프에 의미 없는 간선이 다섯 개 늘고,
 * Part 2 §8이 경계하는 "모듈 간 직접 결합"과 구분이 흐려진다. CommonModule이 가드를
 * 제공하는 것과 같은 판단이다. 리포지토리만 주입받으므로 DatabaseModule(@Global) 위에서
 * 어느 인젝터에서든 만들어진다.
 *
 * Ingest는 여기에 연결하지 않는다 — 웹훅은 사용자 행위가 아니라 시스템 이벤트이고,
 * Ingest는 결합 규칙상 다른 모듈을 import할 수 없다(Part 2 §8).
 */
@Global()
@Module({
  controllers: [ProjectAuditController, AuditLogsController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
