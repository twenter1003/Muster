import type { PolicyTool, PolicyVerdict } from '../../database/entities/enums';

export interface PolicyCheck {
  tool: PolicyTool;
  verdict: PolicyVerdict;
  /** 사람 승인 화면에 띄울 자연어 위험도 설명 (설계서 Part 1 §3.2.1). */
  risk_notes: string | null;
}

export interface PolicyGateInput {
  dockerfile: string;
  compose: string | null;
}

/**
 * Policy Gate 계약 (설계서 Part 2 §6.1).
 *
 * Trivy와 Conftest가 각각 한 결과를 낸다 — "어느 도구가 무엇을 잡아냈는지" 추적해야
 * 룰 커버리지를 개선할 수 있다.
 *
 * **판정은 여기서 하지 않는다.** 이 인터페이스는 도구별 결과만 돌려주고, AND 판정
 * (둘 다 pass여야 policy_passed)은 호출부 한 곳에만 둔다. 판정이 두 곳에 흩어지면
 * 승인 API와 검사 결과가 서로 다른 말을 하게 된다.
 */
export interface PolicyGate {
  run(input: PolicyGateInput): Promise<PolicyCheck[]>;
}

export const POLICY_GATE = Symbol('POLICY_GATE');
