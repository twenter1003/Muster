import { describe, expect, it } from 'vitest';
import {
  getGoalsProgressStats,
  parseGoalChecklist,
  parseGoalChecklistSections,
  toggleGoalChecklist,
} from './goalChecklist';

describe('goalChecklist (Web)', () => {
  describe('parseGoalChecklist', () => {
    it('null이나 빈 문자열이면 빈 배열을 반환한다', () => {
      expect(parseGoalChecklist(null)).toEqual([]);
      expect(parseGoalChecklist('')).toEqual([]);
    });

    it('체크박스 목록을 순서대로 파싱한다', () => {
      const md = `# 목표
- [x] 완료된 목표 1
- [ ] 미완료 목표 2
- [X] 완료된 목표 3
`;
      const items = parseGoalChecklist(md);
      expect(items).toHaveLength(3);
      expect(items[0]).toEqual({ index: 0, title: '완료된 목표 1', completed: true });
      expect(items[1]).toEqual({ index: 1, title: '미완료 목표 2', completed: false });
      expect(items[2]).toEqual({ index: 2, title: '완료된 목표 3', completed: true });
    });

    it('체크박스가 없는 일반 불릿 목록을 미완료 항목으로 파싱한다', () => {
      const md = `- 과제 A\n- 과제 B`;
      const items = parseGoalChecklist(md);
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ index: 0, title: '과제 A', completed: false });
      expect(items[1]).toEqual({ index: 1, title: '과제 B', completed: false });
    });
  });

  describe('parseGoalChecklistSections', () => {
    it('null이나 빈 문자열이면 빈 배열을 반환한다', () => {
      expect(parseGoalChecklistSections(null)).toEqual([]);
      expect(parseGoalChecklistSections('')).toEqual([]);
    });

    it('헤더가 없는 문서는 title이 빈 문자열인 단일 섹션으로 파싱한다', () => {
      const md = `- [x] 태스크 1\n- [ ] 태스크 2`;
      const sections = parseGoalChecklistSections(md);
      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe('');
      expect(sections[0].completedCount).toBe(1);
      expect(sections[0].totalCount).toBe(2);
      expect(sections[0].percent).toBe(50);
      expect(sections[0].items).toEqual([
        { index: 0, title: '태스크 1', completed: true, section: undefined },
        { index: 1, title: '태스크 2', completed: false, section: undefined },
      ]);
    });

    it('마크다운 헤더별로 섹션을 분할하고 글로벌 인덱스를 보존한다', () => {
      const md = `# Phase 1. 기초 설계
- [x] 요구사항 명세서 작성
- [x] DB 스키마 설계

## Phase 2. API 개발
- [x] 엔드포인트 구현
- [ ] 유닛 테스트 작성
- [ ] 부하 테스트

### Phase 3. 릴리즈
- [ ] 프로덕션 배포
`;
      const sections = parseGoalChecklistSections(md);
      expect(sections).toHaveLength(3);

      expect(sections[0].title).toBe('Phase 1. 기초 설계');
      expect(sections[0].completedCount).toBe(2);
      expect(sections[0].totalCount).toBe(2);
      expect(sections[0].percent).toBe(100);
      expect(sections[0].items[0].index).toBe(0);
      expect(sections[0].items[1].index).toBe(1);

      expect(sections[1].title).toBe('Phase 2. API 개발');
      expect(sections[1].completedCount).toBe(1);
      expect(sections[1].totalCount).toBe(3);
      expect(sections[1].percent).toBe(33);
      expect(sections[1].items[0].index).toBe(2);
      expect(sections[1].items[1].index).toBe(3);
      expect(sections[1].items[2].index).toBe(4);

      expect(sections[2].title).toBe('Phase 3. 릴리즈');
      expect(sections[2].completedCount).toBe(0);
      expect(sections[2].totalCount).toBe(1);
      expect(sections[2].percent).toBe(0);
      expect(sections[2].items[0].index).toBe(5);
    });

    it('헤더 앞에 일반 항목이 있는 경우 기본 섹션으로 파싱한다', () => {
      const md = `- [x] 사전 준비
# 1단계
- [ ] 작업 1`;
      const sections = parseGoalChecklistSections(md);
      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('');
      expect(sections[0].items[0].index).toBe(0);
      expect(sections[1].title).toBe('1단계');
      expect(sections[1].items[0].index).toBe(1);
    });
  });

  describe('toggleGoalChecklist', () => {
    it('미완료 체크박스를 완료[x]로 토글한다', () => {
      const md = `- [ ] 과제 1\n- [ ] 과제 2`;
      const updated = toggleGoalChecklist(md, 0);
      expect(updated).toBe(`- [x] 과제 1\n- [ ] 과제 2`);
    });

    it('완료 체크박스를 미완료[ ]로 토글한다', () => {
      const md = `- [x] 과제 1\n- [ ] 과제 2`;
      const updated = toggleGoalChecklist(md, 0);
      expect(updated).toBe(`- [ ] 과제 1\n- [ ] 과제 2`);
    });

    it('일반 불릿 목록에서 토글 시 - [x]로 전환한다', () => {
      const md = `- 과제 1\n- 과제 2`;
      const updated = toggleGoalChecklist(md, 1);
      expect(updated).toBe(`- 과제 1\n- [x] 과제 2`);
    });
  });

  describe('getGoalsProgressStats', () => {
    it('항목이 없으면 0을 반환한다', () => {
      expect(getGoalsProgressStats(null)).toEqual({ total: 0, completed: 0, percent: 0 });
    });

    it('완료/전체 통계와 퍼센트를 계산한다', () => {
      const md = `- [x] 1\n- [ ] 2\n- [x] 3\n- [ ] 4`;
      expect(getGoalsProgressStats(md)).toEqual({
        total: 4,
        completed: 2,
        percent: 50,
      });
    });
  });
});
