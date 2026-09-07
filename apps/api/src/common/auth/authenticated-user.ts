/** 요청 컨텍스트에 실리는 인증 주체. USERS 엔티티의 최소 투영. */
export interface AuthenticatedUser {
  id: string;
  github_login: string;
  email: string | null;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
