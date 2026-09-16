import {
  calculateProgressPercent,
  GoalCheckItem,
  parseGoalChecklist,
  updateChecklistContent,
} from './goal-checklist';

describe('goal-checklist', () => {
  describe('parseGoalChecklist', () => {
    it('null이나 빈 문자열이면 빈 배열을 반환한다', () => {
      expect(parseGoalChecklist(null)).toEqual([]);
      expect(parseGoalChecklist('')).toEqual([]);
      expect(parseGoalChecklist('   ')).toEqual([]);
    });

    it('마크다운 태스크 리스트(- [ ], - [x], - [X])를 정확히 파싱한다', () => {
      const md = `
# 프로젝트 목표
설명 문구입니다.

## 1. 주요 기능
- [x] 사용자 로그인
- [ ] 결제 시스템 연동
* [X] 권한 관리
* [ ] 대시보드 시각화
`;
      const items = parseGoalChecklist(md);
      expect(items).toHaveLength(4);
      expect(items[0]).toMatchObject({
        index: 0,
        title: '사용자 로그인',
        completed: true,
      });
      expect(items[1]).toMatchObject({
        index: 1,
        title: '결제 시스템 연동',
        completed: false,
      });
      expect(items[2]).toMatchObject({
        index: 2,
        title: '권한 관리',
        completed: true,
      });
      expect(items[3]).toMatchObject({
        index: 3,
        title: '대시보드 시각화',
        completed: false,
      });
    });

    it('체크박스가 없는 일반 불릿 및 번호 리스트를 미완료 항목으로 하위 호환 파싱한다', () => {
      const md = `
# 기존 목표
- 첫 번째 과제
- 두 번째 과제
1. 세 번째 과제
`;
      const items = parseGoalChecklist(md);
      expect(items).toHaveLength(3);
      expect(items[0]).toMatchObject({
        index: 0,
        title: '첫 번째 과제',
        completed: false,
      });
      expect(items[1]).toMatchObject({
        index: 1,
        title: '두 번째 과제',
        completed: false,
      });
      expect(items[2]).toMatchObject({
        index: 2,
        title: '세 번째 과제',
        completed: false,
      });
    });

    it('체크박스가 하나라도 있으면 일반 불릿은 체크리스트 항목으로 취급하지 않는다', () => {
      const md = `
# 목표
참고 사항:
- 이것은 그냥 설명 불릿
- [ ] 실제 작업 1
- [x] 실제 작업 2
`;
      const items = parseGoalChecklist(md);
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('실제 작업 1');
      expect(items[1].title).toBe('실제 작업 2');
    });
  });

  describe('updateChecklistContent', () => {
    it('지정된 인덱스의 미완료 체크박스를 [x]로 업데이트한다', () => {
      const md = `# 목표
- [ ] 로그인 구현
- [ ] 결제 연동
- [x] 기존 완료 항목`;

      // 인덱스 1(결제 연동) 완료 처리
      const updated = updateChecklistContent(md, [1]);
      expect(updated).toBe(`# 목표
- [ ] 로그인 구현
- [x] 결제 연동
- [x] 기존 완료 항목`);
    });

    it('일반 불릿 목록에서 특정 항목이 완료되면 - [x]로 변환한다', () => {
      const md = `# 레거시 목표
- 로그인
- 결제
- 정산`;

      const updated = updateChecklistContent(md, [0, 2]);
      expect(updated).toBe(`# 레거시 목표
- [x] 로그인
- 결제
- [x] 정산`);
    });

    it('완료 인덱스가 비어있으면 원본을 그대로 유지한다', () => {
      const md = `- [ ] 작업 1\n- [ ] 작업 2`;
      expect(updateChecklistContent(md, [])).toBe(md);
    });
  });

  describe('calculateProgressPercent', () => {
    it('항목이 0개면 0%를 반환한다', () => {
      expect(calculateProgressPercent([])).toBe(0);
    });

    it('완료 항목 비율을 0~100 정수로 계산한다', () => {
      const items: GoalCheckItem[] = [
        { index: 0, title: 'a', completed: true, rawLine: '' },
        { index: 1, title: 'b', completed: false, rawLine: '' },
        { index: 2, title: 'c', completed: false, rawLine: '' },
      ];
      // 1 / 3 = 33.333% -> 33%
      expect(calculateProgressPercent(items)).toBe(33);

      items[1].completed = true;
      // 2 / 3 = 66.666% -> 67%
      expect(calculateProgressPercent(items)).toBe(67);

      items[2].completed = true;
      // 3 / 3 = 100%
      expect(calculateProgressPercent(items)).toBe(100);
    });
  });
});
