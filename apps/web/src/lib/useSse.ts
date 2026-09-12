import { useEffect, useState } from 'react';
import { API_BASE } from './api';

/** 설계서 Part 4 §7.3의 이벤트 타입. ping은 하트비트라 화면에 보이지 않는다. */
export type StreamEventType = 'log' | 'health_update' | 'stage_change';

export type ConnectionState = 'connecting' | 'open' | 'closed';

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  data: T;
  /** 같은 이벤트가 두 번 렌더되지 않게 하는 키. EventSource의 lastEventId를 쓴다. */
  id: string;
}

/**
 * SSE 구독 (설계서 Part 4 §7.3).
 *
 * EventSource를 쓸 수 있는 이유가 쿠키 인증이다 — EventSource는 헤더를 실을 수 없어서
 * Bearer 토큰을 붙일 방법이 없다. 같은 오리진(vite 프록시 / 배포 시 단일 컨테이너)이라
 * 쿠키가 자동으로 실린다.
 *
 * 재연결은 EventSource가 알아서 한다(기본 3초). 직접 붙이지 않는 이유는, 브라우저 구현이
 * 이미 지수 백오프와 탭 가시성까지 고려하기 때문이다.
 */
export function useSse(projectId: string | null, limit = 50) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [state, setState] = useState<ConnectionState>('closed');

  useEffect(() => {
    if (!projectId) return;

    const source = new EventSource(`${API_BASE}/projects/${projectId}/stream`);
    setState('connecting');

    source.onopen = () => setState('open');
    // EventSource는 끊기면 스스로 다시 붙는다. 여기서 close()하면 그 재연결을 막는다.
    source.onerror = () => setState('connecting');

    const push = (type: StreamEventType) => (e: MessageEvent<string>) => {
      const parsed: unknown = JSON.parse(e.data);
      setEvents((prev) => [{ type, data: parsed, id: e.lastEventId }, ...prev].slice(0, limit));
    };

    const handlers: Array<[StreamEventType, (e: MessageEvent<string>) => void]> = [
      ['log', push('log')],
      ['health_update', push('health_update')],
      ['stage_change', push('stage_change')],
    ];
    for (const [type, handler] of handlers) source.addEventListener(type, handler);

    return () => {
      for (const [type, handler] of handlers) source.removeEventListener(type, handler);
      source.close();
      setState('closed');
    };
  }, [projectId, limit]);

  return { events, state };
}
