import { HealthIndicator } from './HealthIndicator';
import { EM_DASH, HEALTH_MAX, isHealthSignal, type Measurable } from '../lib/domain';
import { parseNumeric, type HealthSnapshotView } from './ProjectOverviewShared';

export function HealthPanel({ snapshot }: { snapshot: HealthSnapshotView }) {
  const composite = parseNumeric(snapshot.composite_score);
  const signal = composite !== null && isHealthSignal(composite);

  // 도넛 둘레. 차트 라이브러리 없이 stroke-dasharray로만 그린다.
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const filled =
    composite === null ? 0 : (Math.min(composite, HEALTH_MAX) / HEALTH_MAX) * circumference;

  const metrics: Array<{ label: string; score: Measurable<number> }> = [
    { label: '배포 빈도', score: snapshot.deploy_freq_score },
    { label: '리드타임', score: snapshot.lead_time_score },
    { label: '변경 실패율', score: snapshot.change_fail_score },
    { label: 'MTTR', score: snapshot.mttr_score },
  ];

  return (
    <div className="po-health">
      {/*
        주석 4 — 도넛 하나로 끝내지 않는다. 도넛은 합산이고, 옆의 4지표가 "왜 그 값인지"다.
        도넛은 장식이라 aria-hidden으로 두고 의미는 옆의 숫자·막대가 전한다.
      */}
      <svg className="po-health__dial" viewBox="0 0 120 120" aria-hidden="true">
        <circle
          className="po-health__track"
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="12"
        />
        <circle
          className={signal ? 'po-health__arc po-health__arc--signal' : 'po-health__arc'}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 60 60)"
        />
        <text className="po-health__value" x="60" y="58" textAnchor="middle" fontSize="24">
          {composite === null ? EM_DASH : composite.toFixed(1)}
        </text>
        <text className="po-health__caption" x="60" y="76" textAnchor="middle" fontSize="10">
          composite / {HEALTH_MAX}
        </text>
      </svg>
      <div className="po-health__metrics">
        <p className="meta po-note">
          composite {composite === null ? EM_DASH : composite.toFixed(1)} / {HEALTH_MAX}
        </p>
        {metrics.map((m) => (
          <div className="po-health__metric" key={m.label}>
            <span>{m.label}</span>
            <HealthIndicator score={m.score} />
          </div>
        ))}
      </div>
    </div>
  );
}
