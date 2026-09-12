import type { LogLevel } from '../lib/domain';

interface LogRowProps {
  /** 이미 포맷된 시각 문자열(예: "09:41"). 포맷 결정은 화면이 한다. */
  time: string;
  level: LogLevel;
  message: string;
}

/**
 * 로그 행 — 시각 · 레벨 · 메시지. error만 채운 배지를 받는다.
 * 레벨을 배지 색이 아니라 텍스트로도 남기는 이유는 색맹 대응이다. 색은 훑기를 돕는 보조일 뿐,
 * 색을 못 봐도 같은 정보가 읽혀야 한다.
 */
export function LogRow({ time, level, message }: LogRowProps) {
  return (
    <div className="log-row">
      <span className="log-row__time">{time}</span>
      <span className={level === 'error' ? 'badge badge--signal' : 'badge'}>{level}</span>
      <span className="log-row__message">{message}</span>
    </div>
  );
}
