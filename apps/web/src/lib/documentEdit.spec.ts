import { describe, expect, it } from 'vitest';
import { buildDocumentPatch, canDownload, type EditableDocument } from './documentEdit';

const current: EditableDocument = { title: '설계서', type: 'prd', commit_ref: 'abc1234' };

describe('buildDocumentPatch', () => {
  it('바뀐 칸만 싣는다', () => {
    const r = buildDocumentPatch(current, {
      title: '설계서 v2',
      type: 'prd',
      commitRef: 'abc1234',
    });

    expect(r).toEqual({ ok: true, body: { title: '설계서 v2' } });
  });

  it('커밋 칸을 비우면 null을 명시해 보낸다', () => {
    // 빼면 "안 고침"이 되어 연결이 그대로 남는다 — 지웠다고 믿는데 서버는 그대로인 상태.
    const r = buildDocumentPatch(current, { title: '설계서', type: 'prd', commitRef: '  ' });

    expect(r).toEqual({ ok: true, body: { commit_ref: null } });
  });

  it('이미 커밋이 없으면 비운 칸을 다시 보내지 않는다', () => {
    const r = buildDocumentPatch(
      { ...current, commit_ref: null },
      { title: '설계서', type: 'prd', commitRef: '' },
    );

    expect(r).toEqual({ ok: false, reason: '바뀐 것이 없다.' });
  });

  it('제목 앞뒤 공백은 버리고 보낸다', () => {
    const r = buildDocumentPatch(current, {
      title: '  새 제목 ',
      type: 'prd',
      commitRef: 'abc1234',
    });

    expect(r).toEqual({ ok: true, body: { title: '새 제목' } });
  });

  it('빈 제목과 300자 초과를 막는다', () => {
    expect(buildDocumentPatch(current, { title: '   ', type: 'prd', commitRef: '' }).ok).toBe(
      false,
    );
    expect(
      buildDocumentPatch(current, { title: 'a'.repeat(301), type: 'prd', commitRef: '' }).ok,
    ).toBe(false);
  });

  it('커밋 해시 형식을 요청 전에 잡는다', () => {
    // 서버 400을 받아 보여 주면 "저장 실패"로만 읽혀 어느 칸이 틀렸는지 되짚어야 한다.
    for (const bad of ['zzzzzzz', 'abc12', 'a'.repeat(41)]) {
      expect(buildDocumentPatch(current, { title: '설계서', type: 'prd', commitRef: bad })).toEqual(
        {
          ok: false,
          reason: '커밋 해시는 7~40자 16진수여야 한다.',
        },
      );
    }
  });

  it('타입 변경도 실린다', () => {
    const r = buildDocumentPatch(current, { title: '설계서', type: 'srs', commitRef: 'abc1234' });

    expect(r).toEqual({ ok: true, body: { type: 'srs' } });
  });
});

describe('canDownload', () => {
  it('업로드가 끝난 문서만 다운로드를 건다', () => {
    expect(canDownload({ upload_status: 'completed' })).toBe(true);
    expect(canDownload({ upload_status: 'pending' })).toBe(false);
  });
});
