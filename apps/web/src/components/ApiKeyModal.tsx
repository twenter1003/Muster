import { useEffect, useState } from 'react';
import { ApiError, apiFetch, type Page as ApiPage } from '../lib/api';
import { formatDateTime } from '../lib/domain';
import { useApi } from '../lib/useApi';
import { Button } from './Button';
import { Modal } from './Modal';
import './ApiKeyModal.css';

export interface ApiKeyView {
  id: string;
  label: string;
  key_suffix: string | null;
  created_at: string;
}

interface ApiKeyModalProps {
  open: boolean;
  projectId: string;
  projectName?: string;
  onClose: () => void;
  onKeysChanged?: () => void;
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return '알 수 없는 오류가 발생했습니다.';
}

export function ApiKeyModal({
  open,
  projectId,
  projectName,
  onClose,
  onKeysChanged,
}: ApiKeyModalProps) {
  const { data, loading, reload } = useApi<ApiPage<ApiKeyView>>(
    open ? `/projects/${projectId}/api-keys?limit=50` : null,
  );

  const [label, setLabel] = useState('local-agent');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ label: string; key: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedGlobalCmd, setCopiedGlobalCmd] = useState(false);
  const [copiedProjectCmd, setCopiedProjectCmd] = useState(false);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setIssued(null);
      setConfirmId(null);
      setRevokeError(null);
      setIssueError(null);
      setCopiedKey(false);
      setCopiedGlobalCmd(false);
      setCopiedProjectCmd(false);
    }
  }, [open]);

  const copyToClipboard = async (text: string, onSuccess: () => void) => {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      setIssueError(
        '이 브라우저에서는 자동 복사가 지원되지 않습니다. 텍스트를 직접 복사해 주세요.',
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onSuccess();
      setTimeout(() => {
        setCopiedKey(false);
        setCopiedGlobalCmd(false);
        setCopiedProjectCmd(false);
      }, 2500);
    } catch {
      setIssueError('클립보드 복사에 실패했습니다.');
    }
  };

  const handleIssue = async () => {
    const trimmed = label.trim();
    if (issuing || trimmed.length === 0) return;
    setIssuing(true);
    setIssueError(null);
    try {
      const res = await apiFetch<ApiKeyView & { key: string }>(`/projects/${projectId}/api-keys`, {
        method: 'POST',
        body: JSON.stringify({ label: trimmed }),
      });
      setIssued({ label: res.label, key: res.key });
      setLabel('local-agent');
      reload();
      onKeysChanged?.();
    } catch (e: unknown) {
      setIssueError(errorMessage(e));
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (revoking !== null) return;
    setRevoking(id);
    setRevokeError(null);
    try {
      await apiFetch<void>(`/api-keys/${id}`, { method: 'DELETE' });
      setConfirmId(null);
      reload();
      onKeysChanged?.();
    } catch (e: unknown) {
      setRevokeError(errorMessage(e));
    } finally {
      setRevoking(null);
    }
  };

  const keys: ApiKeyView[] = data?.items ?? [];

  const apiOrigin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://muster-54275961665.asia-northeast3.run.app';

  const globalCmd = issued
    ? `node ~/Muster/scripts/muster-connect.mjs --global --url="${apiOrigin}" --key="${issued.key}" --tools=both --yes`
    : '';

  const projectCmd = issued
    ? `node ~/Muster/scripts/muster-connect.mjs --project="${projectId}" --url="${apiOrigin}" --key="${issued.key}" --tools=both --yes`
    : '';

  return (
    <Modal
      open={open}
      title={`API 키 관리${projectName ? ` — ${projectName}` : ''}`}
      onClose={onClose}
    >
      <div className="akm__container">
        {/* 안내 팁 박스 (새 키 발급 전) */}
        {issued === null && (
          <div className="akm__tip-box">
            <span>
              💡 새 API 키를 발급받으면 터미널에서 실행할 <strong>1줄 연동 명령어</strong>가
              제공됩니다. 전역 1회 연동 시 모든 레포에서 사용한 에이전트 토큰이 Git 주소에 맞춰
              자동으로 집계됩니다.
            </span>
          </div>
        )}

        {/* 1회성 원문 키 노출 박스 */}
        {issued !== null && (
          <div className="akm__issued-card" role="alert">
            <div className="akm__issued-badge">신규 발급 완료</div>
            <p className="akm__issued-warn">
              ⚠️ 키 원문은 지금 단 1회만 표시됩니다. 창을 닫으면 다시 조회할 수 없습니다.
            </p>
            <div className="akm__key-row">
              <code className="akm__key-code">{issued.key}</code>
              <Button onClick={() => copyToClipboard(issued.key, () => setCopiedKey(true))}>
                {copiedKey ? '✓ 복사됨' : '키 복사'}
              </Button>
            </div>

            <div className="akm__quick-connect">
              <div className="akm__quick-title">⚡ 1줄 연동 명령어 (터미널에서 실행)</div>
              <div className="akm__cmd-group">
                <div className="akm__cmd-item">
                  <div className="akm__cmd-desc">
                    <strong>🚀 전역 1회 자동 라우팅 연동 (가장 추천)</strong>
                    <span>
                      어느 위치에서든 1회 실행하면 홈 디렉터리(~/.muster)에 저장되며, 모든 레포 작업 시 Git 주소 기반으로 자동 집계됩니다.
                    </span>
                  </div>
                  <pre className="akm__cmd-code">{globalCmd}</pre>
                  <Button
                    onClick={() => copyToClipboard(globalCmd, () => setCopiedGlobalCmd(true))}
                  >
                    {copiedGlobalCmd ? '✓ 명령어 복사됨' : '전역 연동 명령어 복사'}
                  </Button>
                </div>

                <div className="akm__cmd-item">
                  <div className="akm__cmd-desc">
                    <strong>📁 현재 레포 전용 연동</strong>
                    <span>
                      연동할 프로젝트 폴더(예: ~/Twshop)에서 실행하면 해당 폴더에 .muster/config.json을 생성합니다.
                    </span>
                  </div>
                  <pre className="akm__cmd-code">{projectCmd}</pre>
                  <Button
                    onClick={() => copyToClipboard(projectCmd, () => setCopiedProjectCmd(true))}
                  >
                    {copiedProjectCmd ? '✓ 명령어 복사됨' : '레포 전용 연동 명령어 복사'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 새 키 발급 입력폼 */}
        <div className="akm__issue-bar">
          <label className="akm__label" htmlFor="new-key-label">
            키 용도(Label)
          </label>
          <input
            id="new-key-label"
            className="input akm__input"
            value={label}
            placeholder="local-dev, macbook-pro 등"
            maxLength={100}
            onChange={(e) => setLabel(e.target.value)}
            disabled={issuing}
          />
          <Button disabled={issuing || label.trim().length === 0} onClick={handleIssue}>
            {issuing ? '발급 중…' : '+ 새 API 키 발급'}
          </Button>
        </div>

        {issueError && <p className="akm__error">{issueError}</p>}
        {revokeError && <p className="akm__error">{revokeError}</p>}

        {/* 기존 키 목록 */}
        <div className="akm__list-section">
          <div className="akm__section-head">
            <span className="akm__section-title">등록된 API 키 ({keys.length})</span>
            {loading && <span className="meta">불러오는 중…</span>}
          </div>

          {keys.length === 0 && !loading ? (
            <div className="akm__empty">
              아직 발급된 API 키가 없습니다. 위에서 새 키를 발급받으세요.
            </div>
          ) : (
            <ul className="akm__key-list">
              {keys.map((k: ApiKeyView) => (
                <li key={k.id} className="akm__key-item">
                  <div className="akm__item-info">
                    <span className="akm__item-label">{k.label}</span>
                    <span className="akm__item-suffix">
                      {k.key_suffix ? `muster_••••${k.key_suffix}` : 'muster_••••'}
                    </span>
                    <span className="meta">{formatDateTime(k.created_at)}</span>
                  </div>

                  <div className="akm__item-actions">
                    {confirmId === k.id ? (
                      <div className="akm__confirm-group">
                        <span className="meta">폐기할까요?</span>
                        <Button disabled={revoking !== null} onClick={() => handleRevoke(k.id)}>
                          {revoking === k.id ? '폐기 중…' : '폐기 확인'}
                        </Button>
                        <Button onClick={() => setConfirmId(null)}>취소</Button>
                      </div>
                    ) : (
                      <Button onClick={() => setConfirmId(k.id)}>폐기</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
