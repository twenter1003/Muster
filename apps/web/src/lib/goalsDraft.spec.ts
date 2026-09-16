import { describe, expect, it } from 'vitest';
import { shouldConfirmDraftOverwrite } from './goalsDraft';

describe('shouldConfirmDraftOverwrite', () => {
  it('편집 중인 텍스트가 있으면 확인이 필요하다', () => {
    expect(shouldConfirmDraftOverwrite('# 목표\n\n로그인 기능을 만든다.')).toBe(true);
  });

  it('빈 칸이면 잃을 게 없어 확인 없이 바로 만든다', () => {
    expect(shouldConfirmDraftOverwrite('')).toBe(false);
  });

  it('공백만 있어도 실질적으로 빈 칸이다', () => {
    expect(shouldConfirmDraftOverwrite('   \n\t  ')).toBe(false);
  });
});
