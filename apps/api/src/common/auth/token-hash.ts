import { createHash } from 'node:crypto';

/**
 * 토큰을 SHA-256으로 해시한다. DB가 유출돼도 세션·API 키를 탈취당하지 않기 위함이다.
 *
 * bcrypt/argon2를 쓰지 않는 이유: 토큰은 사람이 만든 비밀번호와 달리 256비트 난수라
 * 무차별 대입이 불가능하다. 오히려 느린 해시는 매 요청마다 붙는 비용이 된다.
 *
 * 세션 토큰(modules/auth)과 프로젝트 API 키(project-core), 그리고 이 둘을 검사하는
 * common/auth의 가드가 같은 함수를 쓴다. 그래서 특정 모듈이 아니라 common에 둔다 —
 * Ingest는 modules/*를 import할 수 없으므로(Part 2 §8) 여기 있어야 가드가 성립한다.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
