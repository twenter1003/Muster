import { describe, expect, it } from 'vitest';
import { hrefFor, type SearchHit } from './SearchBox';

// 전역 주입이 꺼진 저장소라 describe/it/expect를 명시적으로 들여온다.

const hit = (over: Partial<SearchHit>): SearchHit => ({
  kind: 'project',
  id: 'x',
  title: 't',
  project_id: 'p',
  project_name: 'n',
  ...over,
});

/**
 * 결과를 눌렀을 때 갈 곳.
 *
 * 문서·에이전트에는 자기 화면이 없어 프로젝트의 해당 탭으로 보낸다. 이 규칙이 틀리면
 * 검색 결과가 막다른 길이 되는데, 누르기 전까지는 아무도 모른다.
 */
describe('hrefFor', () => {
  it('프로젝트는 그 프로젝트로 간다', () => {
    expect(hrefFor(hit({ kind: 'project', id: 'proj-1' }))).toBe('/projects/proj-1');
  });

  it('문서는 자기 id가 아니라 프로젝트의 문서 탭으로 간다', () => {
    // 문서 상세 경로는 없다. 문서 id로 보내면 "준비 중"이 뜬다.
    expect(hrefFor(hit({ kind: 'document', id: 'doc-1', project_id: 'proj-2' }))).toBe(
      '/projects/proj-2?tab=docs',
    );
  });

  it('에이전트는 프로젝트의 에이전트 탭으로 간다', () => {
    expect(hrefFor(hit({ kind: 'agent', id: 'ag-1', project_id: 'proj-3' }))).toBe(
      '/projects/proj-3?tab=agents',
    );
  });
});
