import { IsString, Length } from 'class-validator';

/**
 * `GET /search?q=`.
 *
 * q는 필수다. 없는 검색어로 부르는 것은 "전부 달라"는 뜻이 되는데, 이 엔드포인트는 목록이
 * 아니라 찾기이므로 그런 호출에 답할 것이 없다. 화면은 입력이 비면 아예 부르지 않는다.
 *
 * 상한 200자는 프로젝트 이름·문서 제목의 상한과 같다. 그보다 긴 검색어는 어떤 행과도
 * 일치할 수 없으므로 질의를 보낼 이유가 없다.
 */
export class SearchQuery {
  @IsString()
  @Length(1, 200, { message: 'q는 1~200자여야 합니다.' })
  q!: string;
}
