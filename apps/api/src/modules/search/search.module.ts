import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Search — 상단바의 "프로젝트·문서·에이전트 검색".
 *
 * Reports·Inbox와 같은 꼴의 신설 모듈이다(설계서 Part 2 §2의 7개 목록에 없다). 세 모듈이
 * 소유한 테이블을 가로질러 읽으므로 어느 한 모듈에 넣을 수 없고, 세 모듈의 서비스를
 * 호출하면 그 셋이 서로 엮인다. 읽기 전용이라 리포지토리를 직접 주입해 쓴다.
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
