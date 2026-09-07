import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'agentops:isPublic';

/**
 * 인증을 요구하지 않는 엔드포인트 표시.
 * 통합설계서 Part 4 §2의 OAuth 로그인/콜백, 7.1의 GitHub 웹훅(HMAC로 별도 인증)에 사용한다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
