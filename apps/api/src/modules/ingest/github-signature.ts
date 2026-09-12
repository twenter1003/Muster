import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * 설계서 Part 2 §6.3 — GitHub 웹훅 HMAC 검증.
 *
 * **파싱된 본문이 아니라 원문 바이트로 계산해야 한다.** JSON.parse 후 다시 stringify하면
 * 키 순서·공백·유니코드 이스케이프가 미묘하게 달라져 서명이 어긋난다. 그래서 컨트롤러가
 * `rawBody`를 그대로 넘긴다 (main.ts의 `rawBody: true`).
 *
 * 비교는 timingSafeEqual로 한다. `===`는 첫 불일치 바이트에서 즉시 끝나므로, 응답 시간
 * 차이를 재면서 서명을 한 바이트씩 맞춰 나갈 여지를 준다.
 */
export function isValidSignature(
  rawBody: Buffer,
  secret: string,
  header: string | undefined,
): boolean {
  if (!header || !header.startsWith(PREFIX)) return false;

  const expected = Buffer.from(
    PREFIX + createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8',
  );
  const actual = Buffer.from(header, 'utf8');

  // timingSafeEqual은 길이가 다르면 던진다. 길이는 어차피 서명 형식에서 드러나므로
  // 여기서 먼저 걸러도 새어 나가는 정보가 없다.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
