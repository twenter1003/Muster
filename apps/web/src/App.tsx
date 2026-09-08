import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from './lib/api';

interface Health {
  status: string;
  uptime_seconds: number;
}

/**
 * Phase 1 자리표시자 화면. API 연결과 에러 포맷 처리 경로만 검증한다.
 * 실제 화면(승인 UI, 대시보드)은 해당 모듈 페이즈에서 이 껍데기 위에 붙인다.
 */
export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Health>('/health')
      .then(setHealth)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e)),
      );
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Muster</h1>
      <p style={{ color: '#666' }}>Phase 1 — 스캐폴딩</p>
      {health && <p>API 상태: {health.status} (uptime {health.uptime_seconds}s)</p>}
      {error && <p style={{ color: '#b00' }}>API 연결 실패 — {error}</p>}
      {!health && !error && <p>API 확인 중…</p>}
    </main>
  );
}
