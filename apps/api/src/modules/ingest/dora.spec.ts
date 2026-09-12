import { scoreDora, WINDOW_DAYS, type ScoredEvent } from './dora';

const NOW = new Date('2026-09-12T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3600_000);

const ev = (
  status: 'success' | 'failure',
  daysAgo: number,
  committedDaysAgo?: number,
): ScoredEvent => ({
  status,
  occurred_at: ago(daysAgo),
  committed_at: committedDaysAgo === undefined ? null : ago(committedDaysAgo),
});

/**
 * 설계서 Part 2 §6.4의 등급표를 그대로 검증한다. 지표 계산은 틀려도 화면에 숫자가 뜨기 때문에
 * 눈으로는 발견되지 않는다 — 경계값을 코드로 못 박아 두는 것 말고 방법이 없다.
 */
describe('DORA 산출', () => {
  describe('데이터 부족', () => {
    it('이벤트가 없으면 네 지표 모두 null이고 스냅샷을 만들지 않는다', () => {
      expect(scoreDora([], NOW)).toEqual({
        deploy_freq_score: null,
        lead_time_score: null,
        change_fail_score: null,
        mttr_score: null,
        composite_score: null,
      });
    });

    it('관측 창(90일) 밖의 이벤트는 세지 않는다', () => {
      // 반년 전에 멈춘 프로젝트가 지금도 Elite로 보이면 안 된다.
      expect(scoreDora([ev('success', WINDOW_DAYS + 1)], NOW).composite_score).toBeNull();
    });
  });

  describe('배포 빈도', () => {
    it('주 1회 이상이면 Elite(4)', () => {
      const weekly = Array.from({ length: 13 }, (_, i) => ev('success', i * 7));
      expect(scoreDora(weekly, NOW).deploy_freq_score).toBe(4);
    });

    it('월 1회 수준이면 High(3)', () => {
      const monthly = [ev('success', 5), ev('success', 35), ev('success', 65)];
      expect(scoreDora(monthly, NOW).deploy_freq_score).toBe(3);
    });

    it('분기 1회 수준이면 Medium(2)', () => {
      expect(scoreDora([ev('success', 40)], NOW).deploy_freq_score).toBe(2);
    });

    it('성공이 0건이면 Low(1) — 데이터 없음과 다르다', () => {
      // 배포를 시도했고 한 번도 성공하지 못했다는 건 측정된 사실이다.
      expect(scoreDora([ev('failure', 3)], NOW).deploy_freq_score).toBe(1);
    });
  });

  describe('변경 리드타임', () => {
    it('1일 이내면 Elite(4)', () => {
      expect(scoreDora([ev('success', 3, 3.5)], NOW).lead_time_score).toBe(4);
    });

    it('1주 이내면 High(3)', () => {
      expect(scoreDora([ev('success', 3, 8)], NOW).lead_time_score).toBe(3);
    });

    it('1개월 초과면 Low(1)', () => {
      expect(scoreDora([ev('success', 3, 50)], NOW).lead_time_score).toBe(1);
    });

    it('committed_at이 없는 이벤트만 있으면 이 지표만 null이다', () => {
      const scores = scoreDora([ev('success', 3), ev('success', 10)], NOW);

      expect(scores.lead_time_score).toBeNull();
      // 나머지 지표는 살아 있고, 평균도 남은 것들로만 낸다.
      expect(scores.deploy_freq_score).not.toBeNull();
      expect(scores.composite_score).not.toBeNull();
    });

    it('실패한 배포는 리드타임에서 뺀다', () => {
      // 실패에 걸린 시간은 "변경이 전달되기까지"가 아니다.
      const scores = scoreDora([ev('success', 3, 3.5), ev('failure', 2, 60)], NOW);
      expect(scores.lead_time_score).toBe(4);
    });

    it('중앙값을 쓴다 (평균이 아니다)', () => {
      // 이상치 하나가 등급을 통째로 끌어내리지 않아야 한다.
      const events = [ev('success', 10, 10.5), ev('success', 8, 8.5), ev('success', 6, 80)];
      expect(scoreDora(events, NOW).lead_time_score).toBe(4);
    });
  });

  describe('변경 실패율', () => {
    it('15% 이하면 Elite(4)', () => {
      const events = [...Array.from({ length: 9 }, (_, i) => ev('success', i)), ev('failure', 10)];
      expect(scoreDora(events, NOW).change_fail_score).toBe(4);
    });

    it('30% 이하면 High(3)', () => {
      const events = [ev('failure', 1), ev('success', 2), ev('success', 3), ev('success', 4)];
      expect(scoreDora(events, NOW).change_fail_score).toBe(3);
    });

    it('45% 초과면 Low(1)', () => {
      expect(scoreDora([ev('failure', 1), ev('success', 2)], NOW).change_fail_score).toBe(1);
    });
  });

  describe('MTTR', () => {
    it('1시간 이내 복구면 Elite(4)', () => {
      const events = [
        { status: 'failure' as const, occurred_at: ago(2, 1), committed_at: null },
        { status: 'success' as const, occurred_at: ago(2, 0.5), committed_at: null },
      ];
      expect(scoreDora(events, NOW).mttr_score).toBe(4);
    });

    it('1일 이내 복구면 High(3)', () => {
      expect(scoreDora([ev('failure', 5), ev('success', 4.5)], NOW).mttr_score).toBe(3);
    });

    it('아직 복구되지 않은 실패는 세지 않는다', () => {
      // "지금까지 걸린 시간"을 세면 장애가 길어질수록 값이 자라 과거와 비교가 안 된다.
      expect(scoreDora([ev('success', 10), ev('failure', 1)], NOW).mttr_score).toBeNull();
    });

    it('연속된 실패는 첫 실패를 장애 시작으로 본다', () => {
      const events = [ev('failure', 5), ev('failure', 4.9), ev('success', 4.5)];
      // 첫 실패(5일 전) → 복구(4.5일 전) = 12시간 → High(3).
      expect(scoreDora(events, NOW).mttr_score).toBe(3);
    });

    it('성공만 있으면 null이다 (장애가 없었던 것이 나쁜 점수가 되면 안 된다)', () => {
      expect(scoreDora([ev('success', 3), ev('success', 5)], NOW).mttr_score).toBeNull();
    });
  });

  describe('composite_score', () => {
    it('남은 지표만으로 평균한다', () => {
      // 성공 1건(committed_at 없음): 빈도 Medium(2), 실패율 Elite(4), 리드타임·MTTR은 null.
      const scores = scoreDora([ev('success', 40)], NOW);

      expect(scores.lead_time_score).toBeNull();
      expect(scores.mttr_score).toBeNull();
      expect(scores.composite_score).toBe(3); // (2 + 4) / 2
    });

    it('소수점 두 자리로 맞춘다 (numeric(3,2) 컬럼)', () => {
      const events = [ev('failure', 5), ev('success', 4.5, 6), ev('success', 3, 3.5)];
      const composite = scoreDora(events, NOW).composite_score!;

      expect(composite).toBe(Math.round(composite * 100) / 100);
      expect(composite).toBeGreaterThanOrEqual(1);
      expect(composite).toBeLessThanOrEqual(4);
    });
  });
});
