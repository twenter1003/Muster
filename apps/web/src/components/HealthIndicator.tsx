import { EM_DASH, HEALTH_MAX, isHealthSignal, type Measurable } from '../lib/domain';

/**
 * 헬스 표시 — 숫자 + 4칸 막대. 2.5 미만에서만 신호색이고, 임계값은 domain.ts 상수 하나에서 온다.
 *
 * score가 null이면 —로 비운다. GitHub 미연동 프로젝트는 헬스가 계산되지 않는데,
 * 그걸 0.0으로 적으면 "나쁨"으로 읽힌다. 0은 측정 결과이고 —는 측정 불가다.
 */
export function HealthIndicator({ score }: { score: Measurable<number> }) {
  if (score === null) {
    return <span className="health">{EM_DASH}</span>;
  }

  const signal = isHealthSignal(score);
  const filled = Math.max(0, Math.min(HEALTH_MAX, Math.round(score)));

  return (
    <span
      className={signal ? 'health health--signal' : 'health'}
      // 막대는 장식이고 의미는 숫자에 있다. 스크린 리더에는 숫자만 한 번 읽히게 한다.
      aria-label={`헬스 ${score.toFixed(1)} / ${HEALTH_MAX}`}
    >
      <span className="health__value">{score.toFixed(1)}</span>
      <span className="health__bar" aria-hidden="true">
        {Array.from({ length: HEALTH_MAX }, (_, i) => (
          <span
            key={i}
            className={i < filled ? 'health__cell health__cell--filled' : 'health__cell'}
          />
        ))}
      </span>
    </span>
  );
}
