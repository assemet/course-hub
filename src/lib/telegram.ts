export interface TelegramUserData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUserData;
    start_param?: string;
  };
  platform?: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  themeParams: Record<string, string>;
  colorScheme: 'light' | 'dark';
  viewportHeight: number;
  viewportStableHeight: number;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton: {
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  HapticFeedback: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

export function getTelegramUser(): TelegramUserData | null {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }
  return null;
}

/** Raw signed initData string; must be verified server-side, never trusted as-is. */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

export function getTelegramStartParam(): string | null {
  return getTelegramWebApp()?.initDataUnsafe?.start_param ?? null;
}

export function isRunningInTelegram(): boolean {
  // The Telegram WebApp script is only injected by Telegram clients
  // (ios, android, web, desktop). Its mere presence confirms we're inside
  // Telegram — do NOT require platform, initData, or initDataUnsafe.user to
  // be populated, since those can be empty on Web/Desktop depending on how
  // the app was launched.
  return getTelegramWebApp() !== null;
}

export function initTelegramWebApp(): void {
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#ffffff');
      tg.setBackgroundColor('#f8fafc');
    } catch {
      // some versions don't support these
    }
  }
}

export function hapticFeedback(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' = 'light'): void {
  const tg = getTelegramWebApp();
  if (!tg?.HapticFeedback) return;
  if (type === 'success' || type === 'error' || type === 'warning') {
    tg.HapticFeedback.notificationOccurred(type);
  } else {
    tg.HapticFeedback.impactOccurred(type);
  }
}

/** Returns a normalized http(s) URL, or null for anything else (javascript:, data:, ...). */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isTelegramLink(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 't.me' || host === 'telegram.me' || host.endsWith('.t.me');
}

export function openExternalLink(url: string): void {
  const safe = sanitizeUrl(url);
  if (!safe) return;
  const tg = getTelegramWebApp();
  if (tg) {
    tg.openLink(safe);
  } else {
    window.open(safe, '_blank', 'noopener,noreferrer');
  }
}

export function openTelegramLink(url: string): void {
  const safe = sanitizeUrl(url);
  if (!safe) return;
  const tg = getTelegramWebApp();
  // openTelegramLink only accepts t.me links; anything else goes to the browser.
  if (tg && isTelegramLink(safe)) {
    tg.openTelegramLink(safe);
  } else {
    openExternalLink(safe);
  }
}
