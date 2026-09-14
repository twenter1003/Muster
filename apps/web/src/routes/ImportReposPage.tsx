import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { ApiError, apiPost } from '../lib/api';
import { EM_DASH, formatDateTime } from '../lib/domain';
import { useApi } from '../lib/useApi';
import './ImportReposPage.css';

interface GithubRepoView {
  full_name: string;
  private: boolean;
  default_branch: string;
  pushed_at: string | null;
  language: string | null;
  already_imported: boolean;
}

interface ImportResultItem {
  full_name: string;
  status: 'created' | 'failed';
  project_id?: string;
  error?: string;
}

/**
 * 레포 가져오기(온보딩). 로그인 직후 프로젝트가 0개인 사용자가 보는 화면이자,
 * 프로젝트 목록의 "레포 더 가져오기"가 돌아오는 곳이기도 하다.
 *
 * 여기서 고른 레포는 "프로젝트 생성 + Git 연동 + 웹훅 등록"이 POST /projects/import
 * 한 번으로 끝난다 — 예전에는 빈 프로젝트를 만들고 설정에서 따로 레포를 붙여야 했다.
 */
export function ImportReposPage() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<{ items: GithubRepoView[] }>('/github/repos');
  const repos = useMemo(() => data?.items ?? [], [data]);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [failures, setFailures] = useState<ImportResultItem[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return repos;
    return repos.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [repos, query]);

  const toggle = (fullName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0 || importing) return;
    setImporting(true);
    setImportError(null);

    try {
      const res = await apiPost<{ items: ImportResultItem[] }>('/projects/import', {
        repos: [...selected],
      });

      const failed = res.items.filter((i) => i.status === 'failed');
      setFailures(failed);

      if (failed.length === 0) {
        navigate('/');
        return;
      }

      // 실패한 것만 다시 선택된 채로 남겨 재시도하기 쉽게 한다. 성공한 것은
      // already_imported로 바뀐 목록을 다시 받아야 하니 새로고침한다.
      setSelected(new Set(failed.map((f) => f.full_name)));
      reload();
    } catch (err) {
      setImportError(err instanceof ApiError ? `${err.message} (${err.code})` : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page import">
      <header>
        <p className="meta import__eyebrow">시작하기</p>
        <h1 className="page__title">GitHub 레포를 가져오세요</h1>
        <p className="meta">
          가져온 레포는 프로젝트가 되어 커밋 · 배포 · 에러 로그 · Claude 토큰 사용량을 자동으로
          모니터링합니다.
        </p>
      </header>

      <input
        className="input import__search"
        placeholder="레포 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error !== null ? (
        <p className="error-note" role="alert">
          레포 목록을 불러오지 못했다: {error.message}
          {error.code === 'GITHUB_REAUTH_REQUIRED' ? (
            <>
              {' '}
              <a href="/api/v1/auth/github/login">다시 로그인</a>
            </>
          ) : null}
        </p>
      ) : loading ? (
        <p className="meta">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="meta">{repos.length === 0 ? '가져올 레포가 없다.' : '검색 결과가 없다.'}</p>
      ) : (
        <div className="import__list">
          {visible.map((r) => {
            const checked = selected.has(r.full_name);
            return (
              <label key={r.full_name} className="import__row" aria-disabled={r.already_imported}>
                <input
                  type="checkbox"
                  className="import__checkbox"
                  checked={r.already_imported || checked}
                  disabled={r.already_imported}
                  onChange={() => toggle(r.full_name)}
                />
                <span className="import__row-body">
                  <span className="import__row-head">
                    <span className="import__name">{r.full_name}</span>
                    <span className="badge">{r.private ? 'Private' : 'Public'}</span>
                    {r.already_imported && <span className="badge">가져옴</span>}
                  </span>
                  <span className="meta">
                    {r.language ?? EM_DASH} · 마지막 푸시{' '}
                    {r.pushed_at === null ? EM_DASH : formatDateTime(r.pushed_at)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {failures.length > 0 && (
        <div className="error-note" role="alert">
          가져오지 못한 레포가 있다:
          <ul className="import__failures">
            {failures.map((f) => (
              <li key={f.full_name}>
                {f.full_name} — {f.error ?? '알 수 없는 오류'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {importError !== null && (
        <p className="error-note" role="alert">
          가져오지 못했다: {importError}
        </p>
      )}

      <div className="import__footer">
        <p className="meta">
          선택 {selected.size}개 · 가져오면 웹훅과 배포 이벤트 수신이 자동으로 설정됩니다
        </p>
        <Button variant="solid" disabled={selected.size === 0 || importing} onClick={submit}>
          {importing ? '가져오는 중…' : '가져오기'}
        </Button>
      </div>
    </section>
  );
}
