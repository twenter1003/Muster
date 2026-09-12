import { describe, expect, it } from 'vitest';
import { listPath } from './listQuery';

// 전역 주입을 켜지 않은 저장소라 describe/it/expect를 명시적으로 들여온다(api.spec.ts와 같다).
describe('listPath', () => {
  it('값이 없는 필터는 키 자체를 내보내지 않는다', () => {
    expect(listPath('/documents', { limit: 50, cursor: null, type: null })).toBe(
      '/documents?limit=50',
    );
    expect(listPath('/documents', { type: '' })).toBe('/documents');
  });

  it('아무 조건도 없으면 물음표를 붙이지 않는다', () => {
    expect(listPath('/agents', {})).toBe('/agents');
  });

  it('커서를 인코딩한다 — 서버가 준 불투명 문자열에 +나 =가 들어온다', () => {
    expect(listPath('/logs', { cursor: 'a+b=c/d' })).toBe('/logs?cursor=a%2Bb%3Dc%2Fd');
  });
});
