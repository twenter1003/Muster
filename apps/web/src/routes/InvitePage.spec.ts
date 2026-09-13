import { afterEach, describe, expect, it } from 'vitest';
import { rememberInvite, takeRememberedInvite } from './InvitePage';

// 전역 주입이 꺼진 저장소라 명시적으로 들여온다.

/**
 * 로그인 왕복을 건너 초대를 기억하는 부분.
 *
 * 여기가 이 기능에서 가장 조용히 틀리는 자리다. 틀려도 화면은 멀쩡해 보이고, 초대받은
 * 사람만 로그인한 뒤 대시보드에 떨어져 "초대가 안 됐나" 하게 된다.
 *
 * vitest가 node 환경이라 sessionStorage가 없다. jsdom을 새로 들이는 대신 최소 스텁을 쓴다 —
 * 이 헬퍼가 쓰는 것은 세 메서드뿐이고, 그 이상을 흉내 내면 테스트가 브라우저를 검증하게 된다.
 */
function installStorage(over: Partial<Storage> = {}): void {
  const map = new Map<string, string>();
  const stub: Partial<Storage> = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    ...over,
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: stub,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage');
});

describe('초대 기억하기', () => {
  it('맡긴 것을 그대로 돌려준다', () => {
    installStorage();
    rememberInvite('inv_abc');
    expect(takeRememberedInvite()).toBe('inv_abc');
  });

  it('한 번만 돌려준다 — 두 번 주면 로그인할 때마다 되살아난다', () => {
    installStorage();
    rememberInvite('inv_abc');
    expect(takeRememberedInvite()).toBe('inv_abc');
    expect(takeRememberedInvite()).toBeNull();
  });

  it('맡긴 적이 없으면 null이다', () => {
    installStorage();
    expect(takeRememberedInvite()).toBeNull();
  });

  it('나중 초대가 앞의 것을 덮는다 — 방금 연 링크가 사용자의 의도다', () => {
    installStorage();
    rememberInvite('inv_old');
    rememberInvite('inv_new');
    expect(takeRememberedInvite()).toBe('inv_new');
  });

  it('저장소가 막혀 있어도 터지지 않는다', () => {
    // 사생활 보호 모드 등에서 던진다. 기억을 못 할 뿐 로그인 자체는 되어야 한다.
    installStorage({
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
    });

    expect(() => rememberInvite('inv_abc')).not.toThrow();
    expect(takeRememberedInvite()).toBeNull();
  });
});
