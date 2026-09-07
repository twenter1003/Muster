import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** state 유효 시간. 로그인 왕복에 충분하면서 재사용 창을 좁게 둔다. */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * OAuth state 발급/검증.
 *
 * state는 CSRF 방어 수단이다 — 공격자가 자기 code로 피해자를 콜백에 보내
 * 피해자 세션을 공격자 GitHub 계정에 묶는 것을 막는다.
 *
 * 서버에 상태를 저장하지 않고 HMAC 서명으로 검증한다. 저장 방식이 아니어서
 * 인스턴스가 여러 개여도 동작하고, state 전용 테이블을 만들 필요도 없다.
 */
@Injectable()
export class OAuthStateService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('OAUTH_STATE_SECRET') ?? '';
  }

  issue(): string {
    const nonce = randomBytes(16).toString('base64url');
    const issuedAt = Date.now().toString(36);
    const payload = `${nonce}.${issuedAt}`;
    return `${payload}.${this.sign(payload)}`;
  }

  /** 서명이 맞고 만료되지 않았을 때만 true. */
  verify(state: string | undefined): boolean {
    if (!state) return false;

    const parts = state.split('.');
    if (parts.length !== 3) return false;

    const [nonce, issuedAt, signature] = parts;
    if (!equals(this.sign(`${nonce}.${issuedAt}`), signature)) return false;

    const issued = Number.parseInt(issuedAt, 36);
    return Number.isFinite(issued) && Date.now() - issued < STATE_TTL_MS;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}

/** 서명 비교는 타이밍 공격에 안전해야 한다. */
function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
