import type { ProjectStage } from '../lib/domain';

/**
 * 단계 배지 — planning → operation 6종, 전부 같은 회색.
 * 단계는 우열이 아니라 위치라서 색으로 서열을 만들지 않는다. 그래서 이 컴포넌트에는
 * 색을 바꿀 수 있는 prop이 아예 없다(규칙을 타입으로 막는다).
 */
export function StageBadge({ stage }: { stage: ProjectStage }) {
  return <span className="badge">{stage}</span>;
}
