import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { getTelegramWebApp } from './telegram';

/** `auto` follows Telegram (or the OS outside Telegram). */
export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'course-hub.theme';

// Must match --c-slate-50 / --c-surface in src/index.css.
const CHROME_COLORS: Record<ResolvedTheme, { header: string; background: string }> = {
  light: { header: '#ffffff', background: '#f8fafc' },
  dark: { header: '#151e2e', background: '#0b1120' },
};

function readStoredMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function storeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // storage can be unavailable in some webviews; the choice just won't persist
  }
}

/** The theme Telegram (or the OS) is using right now. */
function systemTheme(): ResolvedTheme {
  const tg = getTelegramWebApp();
  if (tg?.colorScheme === 'dark' || tg?.colorScheme === 'light') return tg.colorScheme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const tg = getTelegramWebApp();
  try {
    tg?.setHeaderColor(CHROME_COLORS[theme].header);
    tg?.setBackgroundColor(CHROME_COLORS[theme].background);
  } catch {
    // older Telegram clients don't support these
  }
}

interface ThemeValue {
  mode: ThemeMode;
  theme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const theme: ResolvedTheme = mode === 'auto' ? system : mode;

  // Layout effect: switch colors before the first paint to avoid a light flash.
  useLayoutEffect(() => applyTheme(theme), [theme]);

  // Follow Telegram / OS theme changes while the app is open.
  useEffect(() => {
    const update = () => setSystem(systemTheme());
    const tg = getTelegramWebApp();
    tg?.onEvent?.('themeChanged', update);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', update);
    return () => {
      tg?.offEvent?.('themeChanged', update);
      media?.removeEventListener?.('change', update);
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    storeMode(next);
    setModeState(next);
  }, []);

  const value = useMemo(() => ({ mode, theme, setMode }), [mode, theme, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
