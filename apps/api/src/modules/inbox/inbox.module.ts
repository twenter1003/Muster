import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

/**
 * Inbox — 인박스 화면용 "처리해야 할 일" 큐.
 *
 * **Reports에 넣지 않고 따로 세운 이유.** 둘은 성격이 같아 보인다(여러 모듈을 가로지르는
 * 읽기 전용 조회, 리포지토리 직접 주입). 그래서 실제로 Reports 안에 넣는 것을 먼저 검토했다.
 * 가르는 지점은 **무엇이 답을 바꾸는가**다:
 *
 * - Reports는 *구간*에 대한 집계다. 같은 구간을 물으면 과거는 변하지 않으므로 답이 같다.
 *   질문은 "지난 30일이 어땠는가"이고, 파라미터는 from/to다.
 * - Inbox는 *지금 이 순간*의 상태에서 유도한 큐다. 승인 한 번에 항목이 사라진다. 질문은
 *   "지금 내가 뭘 해야 하는가"이고, 파라미터는 category다.
 *
 * 한 서비스에 합치면 구간 파라미터와 큐 판정 규칙(임계치·최근성·최신 행만)이 한 클래스
 * 안에서 섞이고, `/reports` 컨트롤러가 `/inbox` 경로를 들고 있게 된다. 공유할 코드도 실제로
 * 없었다 — 겹치는 것은 "멤버 프로젝트로 범위를 좁힌다" 한 조각인데, 그것까지 공용으로
 * 빼면 두 모듈이 한 헬퍼를 통해 다시 묶인다. 스무 줄짜리 질의를 각자 들고 있는 편이
 * 경계가 분명하다(주석으로 서로를 가리켜 둔다).
 *
 * Reports와 마찬가지로 설계서 Part 2 §2의 모듈 목록(7개)에 없는 신설 모듈이다.
 */
@Module({
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
