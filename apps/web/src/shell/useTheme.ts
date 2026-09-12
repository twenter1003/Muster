import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'muster.theme';

function readStored(): ThemePreference {
  // localStorage는 시크릿 모드나 저장 차단 설정에서 접근 자체가 던진다. 기본값으로 살아남는다.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

/**
 * 테마 선택. 기본은 'system'이라 아무 설정도 없으면 tokens.css의 prefers-color-scheme이
 * 그대로 작동하고, 사용자가 고른 순간에만 data-theme를 박아 OS 취향을 덮는다.
 * 즉 "명시적 선택 없음"과 "라이트를 골랐음"을 구분한다 — 둘을 합치면 OS 다크를 못 따라간다.
 */
export function useTheme(): { theme: ThemePreference; cycleTheme: () => void } {
  const [theme, setTheme] = useState<ThemePreference>(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 저장 실패는 이번 세션의 표시에 영향이 없다. 조용히 넘긴다.
    }
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system'));
  }, []);

  return { theme, cycleTheme };
}
