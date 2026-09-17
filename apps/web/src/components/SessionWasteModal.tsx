import { useState, useCallback, useEffect } from 'react';
import { Modal } from './Modal';
import { apiPost, ApiError } from '../lib/api';
import {
  formatCost,
  formatTokenCount,
  getWasteBadge,
  type WasteLevel,
} from '../lib/tokenIntelligence';
import { getAgentLabel } from '../lib/agentFilter';
import { formatBurnRate } from '../lib/burnRate';
import { formatElapsedTime } from '../lib/projectListUtils';
import { formatDateTime } from '../lib/domain';
import './SessionWasteModal.css';

export interface SessionWasteInfo {
  id: string;
  agent_id?: string;
  agent_name: string;
  tokens_used: number;
  cost: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds?: number;
  waste?: {
    level: WasteLevel;
    reason?: string;
    estimated_wasted_tokens?: number;
    estimated_wasted_cost?: string;
    recommendation?: string;
  };
}

export interface SessionWasteModalProps {
  open: boolean;
  onClose: () => void;
  run: SessionWasteInfo | null;
  onAbort?: (runId: string) => Promise<void> | void;
}

export function SessionWasteModal({ open, onClose, run, onAbort }: SessionWasteModalProps) {
  const [aborting, setAborting] = useState(false);
  const [abortError, setAbortError] = useState<string | null>(null);
  const [isAbortedLocal, setIsAbortedLocal] = useState(false);

  // 모달이 열리거나 대상 run이 바뀔 때 로컬 상태 초기화
  useEffect(() => {
    setAborting(false);
    setAbortError(null);
    setIsAbortedLocal(false);
  }, [run?.id, open]);

  const handleAbort = useCallback(async () => {
    if (!run || aborting) return;

    setAborting(true);
    setAbortError(null);

    try {
      await apiPost(`/agent-runs/${run.id}/abort`);
      setIsAbortedLocal(true);
      if (onAbort) {
        await onAbort(run.id);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setAbortError(err.message);
      } else {
        setAbortError('세션 중단 요청 중 오류가 발생했습니다.');
      }
    } finally {
      setAborting(false);
    }
  }, [run, aborting, onAbort]);

  if (!run) return null;

  const currentStatus = isAbortedLocal ? 'cancelled' : run.status;
  const isRunning = currentStatus === 'running';
  const isCancelled = currentStatus === 'cancelled';
  const isSucceeded = currentStatus === 'succeeded';
  const isFailed = currentStatus === 'failed';

  const startMs = new Date(run.started_at).getTime();
  const endMs = run.ended_at ? new Date(run.ended_at).getTime() : Date.now();
  const durationSec = run.duration_seconds ?? Math.max(0, Math.floor((endMs - startMs) / 1000));
  const durationMin = Math.max(0.1, durationSec / 60);
  const burnRate = Math.round(run.tokens_used / durationMin);

  const wasteLevel: WasteLevel = run.waste?.level ?? 'NORMAL';
  const wasteBadge = isRunning
    ? { text: '작업 중', className: 'badge badge--pulse' }
    : isCancelled
      ? { text: '강제 중단됨', className: 'badge badge--signal' }
      : getWasteBadge(wasteLevel);

  const agentLabel = getAgentLabel(run.agent_name);
  const wastedTokens = run.waste?.estimated_wasted_tokens ?? 0;
  const wastedCost = run.waste?.estimated_wasted_cost ?? '0.00';

  return (
    <Modal
      open={open}
      title="에이전트 세션 토큰 낭비 딥다이브"
      onClose={onClose}
      className="session-waste-modal"
    >
      <div className="session-modal__body" data-testid="session-waste-modal-body">
        {/* 상단 메타 바 */}
        <div className="session-modal__header-bar">
          <div className="session-modal__agent-meta">
            <span className="badge badge--agent-tag">{agentLabel}</span>
            <span className="session-modal__agent-name">{run.agent_name}</span>
            <code className="session-modal__run-id" title={`전체 세션 ID: ${run.id}`}>
              #{run.id.slice(0, 8)}
            </code>
          </div>
          <div className="session-modal__status-meta">
            <span className={wasteBadge.className} data-testid="session-status-badge">
              {wasteBadge.text}
            </span>
          </div>
        </div>

        {/* 4분할 핵심 메트릭 그리드 */}
        <div className="session-modal__metrics-grid">
          <div className="session-modal__metric-card">
            <span className="session-modal__metric-label">총 소모 토큰</span>
            <strong className="session-modal__metric-val" data-testid="metric-tokens">
              {formatTokenCount(run.tokens_used)}
            </strong>
            <span className="session-modal__metric-sub">토큰 누적량</span>
          </div>
          <div className="session-modal__metric-card">
            <span className="session-modal__metric-label">소모 비용</span>
            <strong
              className="session-modal__metric-val session-modal__metric-val--cost"
              data-testid="metric-cost"
            >
              {formatCost(run.cost)}
            </strong>
            <span className="session-modal__metric-sub">USD 기준</span>
          </div>
          <div className="session-modal__metric-card">
            <span className="session-modal__metric-label">소요 시간</span>
            <strong className="session-modal__metric-val" data-testid="metric-duration">
              {formatElapsedTime(durationSec)}
            </strong>
            <span className="session-modal__metric-sub">
              {run.ended_at ? '세션 종료됨' : '실시간 카운트'}
            </span>
          </div>
          <div className="session-modal__metric-card">
            <span className="session-modal__metric-label">소모 속도 (Burn Rate)</span>
            <strong
              className="session-modal__metric-val session-modal__metric-val--rate"
              data-testid="metric-rate"
            >
              {formatBurnRate(burnRate)}
            </strong>
            <span className="session-modal__metric-sub">분당 소모율</span>
          </div>
        </div>

        {/* 낭비 진단 분석 패널 */}
        <div
          className={`session-modal__diagnosis session-modal__diagnosis--${wasteLevel.toLowerCase()}`}
        >
          <div className="session-modal__diagnosis-head">
            <div className="session-modal__diagnosis-title">
              <span className="session-modal__diagnosis-icon">
                {wasteLevel === 'HIGH_WASTE' ? '🚨' : wasteLevel === 'CAUTION' ? '⚠️' : '✅'}
              </span>
              <strong>
                {wasteLevel === 'HIGH_WASTE'
                  ? '심각한 토큰 낭비 및 컨텍스트 팽창 감지'
                  : wasteLevel === 'CAUTION'
                    ? '주의: 컨텍스트 누적 팽창 시작'
                    : '정상: 효율적인 토큰 소모 상태'}
              </strong>
            </div>
            {wastedTokens > 0 && (
              <span className="session-modal__waste-estimate">
                추정 낭비: ~{formatTokenCount(wastedTokens)} ({formatCost(wastedCost)})
              </span>
            )}
          </div>

          <p className="session-modal__diagnosis-reason">
            {run.waste?.reason ||
              (wasteLevel === 'HIGH_WASTE'
                ? '장기 대화와 반복된 프롬프트 누적으로 인해 불필요한 토큰 소모가 급증하고 있습니다.'
                : wasteLevel === 'CAUTION'
                  ? '대화 컨텍스트가 증가하면서 턴당 전송되는 프롬프트 토큰이 점진적으로 증가하고 있습니다.'
                  : '컨텍스트 재사용률이 우수하며 낭비 없는 정상적인 실행 상태를 유지하고 있습니다.')}
          </p>

          {wasteLevel !== 'NORMAL' && (
            <div className="session-modal__recommendations">
              <span className="session-modal__rec-label">권장 최적화 조치:</span>
              <ul className="session-modal__rec-list">
                <li>
                  <code>/compact</code> 명령어를 실행하여 대화 이력을 요약 압축하세요.
                </li>
                <li>세션을 분할하고 새 세션을 시작하여 누적 프롬프트 페이로드를 줄이세요.</li>
                <li>프롬프트 캐싱(Prompt Caching) 지원 모델 활용 여부를 점검하세요.</li>
              </ul>
            </div>
          )}
        </div>

        {/* 실행 제어 (원클릭 세션 중단) 섹션 */}
        {isRunning && (
          <div className="session-modal__control-box" data-testid="session-control-box">
            <div className="session-modal__control-info">
              <span className="session-modal__control-icon">⚡</span>
              <div>
                <strong>실시간 실행 중단 제어</strong>
                <p className="meta">
                  백그라운드에서 토큰을 소모 중인 에이전트 CLI 프로세스에 즉시 취소 신호를 전송하고
                  세션을 안전하게 종료합니다.
                </p>
              </div>
            </div>

            {abortError && (
              <p className="error-note" role="alert" style={{ margin: 'var(--space-2) 0' }}>
                {abortError}
              </p>
            )}

            <button
              type="button"
              className="btn btn--danger session-modal__abort-btn"
              onClick={handleAbort}
              disabled={aborting}
              data-testid="modal-abort-button"
            >
              {aborting ? (
                <span className="session-modal__loading">
                  <span className="session-modal__spinner" /> 세션 중단 요청 중…
                </span>
              ) : (
                '🚨 세션 강제 중단 (Abort)'
              )}
            </button>
          </div>
        )}

        {isCancelled && (
          <div className="session-modal__alert-cancelled" data-testid="session-cancelled-alert">
            <span>🛑</span>
            <div>
              <strong>강제 중단된 세션</strong>
              <p className="meta">
                관리자에 의해 작업이 강제 종료되었으며, 추가 토큰/비용 소모가 차단되었습니다.
                {run.ended_at && ` (종료 시각: ${formatDateTime(run.ended_at)})`}
              </p>
            </div>
          </div>
        )}

        {isSucceeded && (
          <div className="session-modal__info-banner">
            <span>✓</span>
            <p className="meta">
              이 세션은 정상적으로 완료되었습니다.
              {run.ended_at && ` (종료: ${formatDateTime(run.ended_at)})`}
            </p>
          </div>
        )}

        {isFailed && (
          <div className="session-modal__info-banner session-modal__info-banner--failed">
            <span>✕</span>
            <p className="meta">
              이 세션은 오류로 인해 실패 종료되었습니다.
              {run.ended_at && ` (종료: ${formatDateTime(run.ended_at)})`}
            </p>
          </div>
        )}

        {/* 하단 닫기 액션 */}
        <div className="session-modal__footer">
          <button type="button" className="btn" onClick={onClose} data-testid="modal-close-button">
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
