import { isSignalStatus, type StatusValue } from '../lib/domain';

/**
 * 상태 배지 — build_status 8종 + agent status 4종을 한 컴포넌트가 맡는다.
 * 왜 하나인가: 종류별로 컴포넌트를 나누면 "policy_blocked·failed만 채운다"는 규칙이
 * 구현마다 흩어지고, 새 상태가 붙을 때 누락된다.
 *
 * 색은 규칙에서 나오지 호출자가 고르지 않는다 — 그래서 variant 같은 prop을 두지 않았다.
 */
export function StatusBadge({ status }: { status: StatusValue }) {
  const signal = isSignalStatus(status);
  return (
    <span className={signal ? 'badge badge--signal' : 'badge'}>
      {/* 색 외에 텍스트로도 상태가 남는다. 색맹 사용자에게 색은 보조 수단일 뿐이다. */}
      {status}
    </span>
  );
}
