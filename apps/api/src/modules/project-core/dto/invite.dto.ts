import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** `POST /projects/:id/invites` — 유효기간만 고를 수 있다. 역할은 항상 member다. */
export class CreateInviteDto {
  @IsOptional()
  @IsInt({ message: 'ttl_days는 정수여야 합니다.' })
  @Min(1, { message: 'ttl_days는 1 이상이어야 합니다.' })
  @Max(30, { message: 'ttl_days는 30 이하여야 합니다.' })
  ttl_days?: number;
}

/**
 * 토큰을 경로가 아니라 **본문**으로 받는다.
 *
 * 경로에 넣으면 토큰이 접근 로그·브라우저 기록·Referer에 그대로 남는다. 초대 링크의 토큰은
 * 그 자체가 접근 권한이라, 사용자 브라우저의 주소창에 있는 것까지는 어쩔 수 없어도
 * 서버 로그에까지 남길 이유는 없다. 조회지만 POST인 것은 그 때문이다.
 */
export class InviteTokenDto {
  @IsString()
  @Length(1, 200, { message: 'token이 필요합니다.' })
  token!: string;
}
