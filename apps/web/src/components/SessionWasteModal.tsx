import { useState, useCallback, useEffect } from 'react';
import { Modal } from './Modal';
import { downloadWasteReport } from '../lib/exportUtils';
import {
  formatCost,
  formatTokenCount,
  getCacheBadge,
  type SessionCacheView,
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
  cache?: SessionCacheView;
}

export interface SessionWasteModalProps {
  open: boolean;
  onClose: () => void;
  run: SessionWasteInfo | null;
  projectId?: string;
  /** 프로젝트 전체 세션 비용 중 이 세션이 중앙값의 몇 배인지(분포 데이터가 없으면 null). */
  multipleOfMedian?: number | null;
}

export function SessionWasteModal({
  open,
  onClose,
  run,
  projectId,
  multipleOfMedian,
}: SessionWasteModalProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'json' | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // 모달이 열리거나 대상 run이 바뀔 때 알림 초기화
  useEffect(() => {
    setExportNotice(null);
  }, [run?.id, open]);

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      if (!projectId || downloadingFormat) return;
      setDownloadingFormat(format);
      setExportNotice(null);
      try {
        const res = await downloadWasteReport(projectId, format);
        if (res.success) {
          setExportNotice(`✅ ${format.toUpperCase()} 다운로드 완료`);
          setTimeout(() => setExportNotice(null), 3000);
        } else {
          setExportNotice(`❌ 실패: ${res.error}`);
          setTimeout(() => setExportNotice(null), 3000);
        }
      } finally {
        setDownloadingFormat(null);
      }
    },
    [projectId, downloadingFormat],
  );

  if (!run) return null;

  const currentStatus = run.status;
  const isRunning = currentStatus === 'running';
  const isCancelled = currentStatus === 'cancelled';
  const isSucceeded = currentStatus === 'succeeded';
  const isFailed = currentStatus === 'failed';

  const startMs = new Date(run.started_at).getTime();
  const endMs = run.ended_at ? new Date(run.ended_at).getTime() : Date.now();
  const durationSec = run.duration_seconds ?? Math.max(0, Math.floor((endMs - startMs) / 1000));
  const durationMin = Math.max(0.1, durationSec / 60);
  const burnRate = Math.round(run.tokens_used / durationMin);

  const hitRate = run.cache?.hit_rate_percentage ?? null;
  const cacheBadge = getCacheBadge(hitRate);
  const statusBadge = isRunning
    ? { text: '작업 중', className: 'badge badge--pulse' }
    : isCancelled
      ? { text: '강제 중단됨', className: 'badge badge--signal' }
      : cacheBadge;

  const agentLabel = getAgentLabel(run.agent_name);
  const hasBreakdown = run.cache?.has_breakdown ?? false;
  const savingsUsd = run.cache?.savings_usd ?? '0.0000';
  const isCostOutlier = typeof multipleOfMedian === 'number' && multipleOfMedian >= 2;

  return (
    <Modal open={open} title="에이전트 세션 상세" onClose={onClose} className="session-waste-modal">
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
            <span className={statusBadge.className} data-testid="session-status-badge">
              {statusBadge.text}
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
            <span className="session-modal__metric-sub">
              {typeof multipleOfMedian === 'number'
                ? `프로젝트 중앙값의 ${multipleOfMedian}배`
                : 'USD 기준'}
            </span>
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

        {/* 캐시 효율 패널 (실측) */}
        <div
          className={`session-modal__diagnosis${
            hasBreakdown
              ? hitRate !== null && hitRate >= 70
                ? ' session-modal__diagnosis--normal'
                : ' session-modal__diagnosis--caution'
              : ''
          }`}
        >
          <div className="session-modal__diagnosis-head">
            <div className="session-modal__diagnosis-title">
              <span className="session-modal__diagnosis-icon">{hasBreakdown ? '📊' : 'ℹ️'}</span>
              <strong>{hasBreakdown ? '캐시 효율 (실측)' : '토큰 내역 없음'}</strong>
            </div>
            {hasBreakdown && Number(savingsUsd) > 0 && (
              <span className="session-modal__waste-estimate">
                캐싱으로 아낀 금액: {formatCost(savingsUsd)}
              </span>
            )}
          </div>

          <p className="session-modal__diagnosis-reason">
            {hasBreakdown
              ? `캐시 적중률 ${hitRate}% (= 캐시 읽기 ${formatTokenCount(run.cache?.cache_read_tokens ?? 0)} / 입력 ${formatTokenCount(run.cache?.input_tokens ?? 0)} 토큰 대비)`
              : '이 세션은 토큰 종류별 내역이 없어 캐시 지표를 계산할 수 없습니다(예전 실행이거나 내역을 보내지 않는 에이전트).'}
          </p>

          {isCostOutlier && (
            <div className="session-modal__recommendations">
              <span className="session-modal__rec-label">
                이 세션 비용이 프로젝트 중앙값보다 뚜렷이 높습니다. 확인해볼 것:
              </span>
              <ul className="session-modal__rec-list">
                <li>
                  <code>/compact</code> 명령어로 대화 이력을 요약 압축했는지
                </li>
                <li>세션이 지나치게 길어져 새 세션 분리가 필요한지</li>
                <li>프롬프트 캐싱(Prompt Caching)이 정상 적용되고 있는지</li>
              </ul>
            </div>
          )}
        </div>

        {/* 세션 상태 안내 배너 */}
        {isRunning && (
          <div className="session-modal__info-banner" data-testid="session-running-banner">
            <span>⚡</span>
            <p className="meta">이 세션은 현재 백그라운드에서 실시간 작업 중입니다.</p>
          </div>
        )}

        {isCancelled && (
          <div className="session-modal__alert-cancelled" data-testid="session-cancelled-alert">
            <span>🛑</span>
            <div>
              <strong>중단된 세션</strong>
              <p className="meta">
                작업이 중단되었으며 추가 토큰/비용 소모가 차단되었습니다.
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

        {exportNotice && (
          <div className="session-modal__info-banner" data-testid="modal-export-notice">
            <span>ℹ️</span>
            <p className="meta">{exportNotice}</p>
          </div>
        )}

        {/* 하단 액션바 */}
        <div className="session-modal__footer">
          {projectId ? (
            <div className="session-modal__export-actions">
              <button
                type="button"
                className="session-modal__export-btn"
                onClick={() => handleExport('csv')}
                disabled={downloadingFormat !== null}
                data-testid="modal-export-csv-btn"
                title="프로젝트 전체 캐시 효율 리포트를 CSV로 다운로드합니다"
              >
                {downloadingFormat === 'csv' ? '⏳ 생성 중...' : '📥 전체 리포트 (CSV)'}
              </button>
              <button
                type="button"
                className="session-modal__export-btn"
                onClick={() => handleExport('json')}
                disabled={downloadingFormat !== null}
                data-testid="modal-export-json-btn"
                title="프로젝트 전체 캐시 효율 리포트를 JSON으로 다운로드합니다"
              >
                {downloadingFormat === 'json' ? '⏳ 생성 중...' : '📥 JSON'}
              </button>
            </div>
          ) : (
            <div />
          )}
          <button type="button" className="btn" onClick={onClose} data-testid="modal-close-button">
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
