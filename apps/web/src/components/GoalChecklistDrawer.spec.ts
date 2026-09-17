import { describe, expect, it } from 'vitest';
import type { GoalCheckItem } from '../lib/goalChecklist';
import {
  filterDrawerItems,
  formatProgressSummary,
  getUpNextItems,
} from './GoalChecklistDrawer';

const mockItems: GoalCheckItem[] = [
  { index: 0, title: '기본 DB 스키마 마이그레이션', completed: true },
  { index: 1, title: '토큰 사용량 실시간 집계 API 개발', completed: false },
  { index: 2, title: 'GitHub 웹훅 이벤트 서명 검증', completed: true },
  { index: 3, title: '토큰 비용 절감 알림 봇 연동', completed: false },
  { index: 4, title: '모바일 반응형 터치 인터랙션 보정', completed: false },
  { index: 5, title: 'E2E 통합 회귀 테스트 실행', completed: false },
];

describe('GoalChecklistDrawer 헬퍼 함수 및 필터링 검증', () => {
  describe('filterDrawerItems', () => {
    it('all 필터는 모든 항목을 반환한다', () => {
      const result = filterDrawerItems(mockItems, 'all', false, '');
      expect(result).toHaveLength(6);
    });

    it('pending 필터는 미완료(대기 중) 항목만 반환한다', () => {
      const result = filterDrawerItems(mockItems, 'pending', false, '');
      expect(result).toHaveLength(4);
      expect(result.every((i) => !i.completed)).toBe(true);
      expect(result.map((i) => i.index)).toEqual([1, 3, 4, 5]);
    });

    it('completed 필터는 완료된 항목만 반환한다', () => {
      const result = filterDrawerItems(mockItems, 'completed', false, '');
      expect(result).toHaveLength(2);
      expect(result.every((i) => i.completed)).toBe(true);
      expect(result.map((i) => i.index)).toEqual([0, 2]);
    });

    it('hideCompleted=true 이면 filter가 all이어도 완료 항목을 제외한다', () => {
      const result = filterDrawerItems(mockItems, 'all', true, '');
      expect(result).toHaveLength(4);
      expect(result.every((i) => !i.completed)).toBe(true);
    });

    it('검색어를 입력하면 대소문자 무관하게 제목에 포함된 항목만 반환한다', () => {
      const result = filterDrawerItems(mockItems, 'all', false, '토큰');
      expect(result).toHaveLength(2);
      expect(result[0].title).toContain('토큰');
      expect(result[1].title).toContain('토큰');
    });

    it('상태 필터와 검색어를 동시에 적용할 수 있다', () => {
      // '토큰' 검색어 중 완료된 것은 0개, 미완료는 2개
      const pendingTokens = filterDrawerItems(mockItems, 'pending', false, '토큰');
      expect(pendingTokens).toHaveLength(2);

      const completedTokens = filterDrawerItems(mockItems, 'completed', false, '토큰');
      expect(completedTokens).toHaveLength(0);
    });

    it('검색 조건에 일치하는 결과가 없으면 빈 배열을 반환한다', () => {
      const result = filterDrawerItems(mockItems, 'all', false, '존재하지않는태스크');
      expect(result).toEqual([]);
    });
  });

  describe('getUpNextItems', () => {
    it('미완료 태스크 중 상위 3개를 순서대로 추출한다', () => {
      const upNext = getUpNextItems(mockItems, 3);
      expect(upNext).toHaveLength(3);
      expect(upNext.map((i) => i.index)).toEqual([1, 3, 4]);
      expect(upNext[0].title).toBe('토큰 사용량 실시간 집계 API 개발');
    });

    it('미완료 태스크가 limit보다 적으면 남은 전체를 반환한다', () => {
      const fewItems: GoalCheckItem[] = [
        { index: 0, title: '과제 1', completed: true },
        { index: 1, title: '과제 2', completed: false },
      ];
      const upNext = getUpNextItems(fewItems, 3);
      expect(upNext).toHaveLength(1);
      expect(upNext[0].index).toBe(1);
    });

    it('모든 항목이 완료되었으면 빈 배열을 반환한다', () => {
      const allDone: GoalCheckItem[] = [
        { index: 0, title: '과제 1', completed: true },
        { index: 1, title: '과제 2', completed: true },
      ];
      expect(getUpNextItems(allDone, 3)).toEqual([]);
    });
  });

  describe('formatProgressSummary', () => {
    it('완료 수와 전체 수로부터 퍼센트를 포함한 뱃지 문구를 생성한다', () => {
      expect(formatProgressSummary(16, 25)).toBe('16/25 완료 (64%)');
      expect(formatProgressSummary(10, 10)).toBe('10/10 완료 (100%)');
    });

    it('0개일 때 0%를 안전하게 반환한다', () => {
      expect(formatProgressSummary(0, 0)).toBe('0/0 완료 (0%)');
    });
  });
});
