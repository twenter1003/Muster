import { EM_DASH } from './domain';

/**
 * 배포 이벤트(DEPLOYMENT_EVENTS)의 표시 규칙.
 *
 * 화면이 아니라 여기에 두는 이유: 커밋 축약 자리수와 리드타임 계산은 DOM 없이 검증할 수
 * 있는 순수 규칙인데(저장소 vitest에 DOM 환경이 없다), tsx 안에 두면 검증이 불가능해진다.
 */

/** 목록에서 커밋을 알아보는 데 필요한 최소 자리수. 저장소가 이미 쓰는 7자리에 맞춘다. */
const SHORT_SHA_LENGTH = 7;

/**
 * 커밋 해시 축약. 40자를 그대로 찍으면 행의 다른 칸이 전부 밀린다.
 *
 * 엔티티 주석대로 페이로드가 이미 짧은 형태를 줄 수 있으므로 자르기 전에 길이를 보지 않는다 —
 * slice는 짧은 문자열을 그대로 돌려준다. 빈 문자열만 "값이 없다"로 갈라 놓는다.
 */
export function shortCommit(sha: string): string {
  return sha === '' ? EM_DASH : sha.slice(0, SHORT_SHA_LENGTH);
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 커밋 → 배포 사이의 리드타임 문구.
 *
 * committed_at이 null인 행이 정상이라는 점이 중요하다(deployment_status 페이로드에는 커밋
 * 시각이 없다 — 엔티티 주석). 그런 행은 0분이 아니라 —다. 0을 찍으면 "즉시 배포됐다"는
 * 거짓이 되고, 이 화면이 근거로 쓰이는 DORA 리드타임 지표를 정확히 반대로 읽게 만든다.
 *
 * 음수도 —로 접는다. 웹훅 재전송이나 시계 어긋남으로 생기는 값이라 "-3시간"을 보여 줘 봐야
 * 읽는 사람이 할 수 있는 일이 없다.
 */
export function leadTimeText(committedAt: string | null, occurredAt: string): string {
  if (committedAt === null) return EM_DASH;

  const from = new Date(committedAt).getTime();
  const to = new Date(occurredAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return EM_DASH;

  const ms = to - from;
  if (ms < 0) return EM_DASH;
  if (ms < MINUTE_MS) return '1분 미만';

  // 큰 단위 하나 + 그 아래 하나까지만 붙인다. "3일 4시간 12분"은 훑는 데 방해만 된다.
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}분`;
  if (ms < DAY_MS) {
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    const hours = Math.floor(ms / HOUR_MS);
    return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
  }
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const days = Math.floor(ms / DAY_MS);
  return hours === 0 ? `${days}일` : `${days}일 ${hours}시간`;
}

/**
 * 신호색을 채울 이벤트인지. 실패만 신호다 —
 * 성공까지 칠하면 색이 "봐야 할 것"이라는 뜻을 잃는다(domain.ts의 isSignalStatus와 같은 규칙).
 */
export function isDeploymentSignal(status: string): boolean {
  return status === 'failure';
}
