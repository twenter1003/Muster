import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports — 리포트 화면용 읽기 전용 집계.
 *
 * **설계서 Part 2 §2의 모듈 목록(7개)에 없는 신설 모듈이다.** UI 설계서의 리포트 화면이
 * 요구하는 집계인데 대응 엔드포인트가 없었다. 기존 모듈에 얹지 않고 따로 세운 이유는
 * 이 집계가 AgentRegistry·EnvCatalog·Ingest 세 모듈의 데이터를 가로지르기 때문이다 —
 * 어느 한 모듈에 넣으면 그 모듈이 남의 도메인을 읽게 되고, 그쪽이 경계를 더 크게 흐린다.
 *
 * 여기서 만드는 것은 조회뿐이고 쓰기는 없다. 다른 모듈의 서비스도 호출하지 않는다
 * (리포지토리 직접 주입 + ingest의 순수 함수 재사용). 자세한 근거는 reports.service.ts 주석.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
