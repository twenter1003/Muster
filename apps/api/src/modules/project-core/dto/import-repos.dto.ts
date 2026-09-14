import { ArrayMaxSize, ArrayNotEmpty, IsArray, Matches } from 'class-validator';

/** repo-url.ts의 owner/repo 문자 제약과 같다 — 여기서도 같은 것만 통과시킨다. */
const FULL_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export class ImportReposDto {
  @IsArray()
  @ArrayNotEmpty({ message: '가져올 레포를 하나 이상 선택하세요.' })
  // 온보딩 화면에서 한 번에 누를 수 있는 현실적인 상한. 무제한으로 두면 웹훅 등록
  // 실패까지 포함해 응답 하나가 지나치게 오래 걸린다.
  @ArrayMaxSize(20, { message: '한 번에 최대 20개까지 가져올 수 있습니다.' })
  @Matches(FULL_NAME, { each: true, message: '레포는 owner/repo 형식이어야 합니다.' })
  repos!: string[];
}
