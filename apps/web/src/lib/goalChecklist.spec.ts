import { describe, expect, it } from 'vitest';
import { getGoalsProgressStats, parseGoalChecklist, toggleGoalChecklist } from './goalChecklist';

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
