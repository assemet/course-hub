import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@/lib/types';
import { getCurrentTelegramUser, getOrCreateUser, switchRole } from '@/lib/auth';
import { initTelegramWebApp, isRunningInTelegram, getTelegramUser } from '@/lib/telegram';

interface UserContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  notInTelegram: boolean;
  toggleRole: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  error: null,
  notInTelegram: false,
  toggleRole: async () => {},
  refreshUser: async () => {},
});

import type { TelegramUserData } from '@/lib/telegram';

// On Telegram Web/Desktop, initDataUnsafe.user may not be populated
// immediately — poll for up to ~3 seconds after ready() is called.
const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 3000;

function waitForTelegramUser(): Promise<TelegramUserData | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const user = getTelegramUser();
      if (user) {
        resolve(user);
        return;
      }
      if (Date.now() - start >= POLL_TIMEOUT_MS) {
        resolve(null);
        return;
      }
      setTimeout(check, POLL_INTERVAL_MS);
    };
    check();
  });
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notInTelegram, setNotInTelegram] = useState(false);

  const loadUser = useCallback(async () => {
    // Call ready() first — on Telegram Web/Desktop the user data may not
    // be available until the WebApp signals it's ready.
    initTelegramWebApp();

    if (!isRunningInTelegram()) {
      setNotInTelegram(true);
      setLoading(false);
      return;
    }

    try {
      // We're inside Telegram but user data might not be populated yet.
      // Poll for it rather than immediately showing the fallback screen.
      const tgUser = await waitForTelegramUser();
      if (!tgUser) {
        setNotInTelegram(true);
        setLoading(false);
        return;
      }
      const dbUser = await getOrCreateUser(tgUser);
      setUser(dbUser);
      setNotInTelegram(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const toggleRole = useCallback(async () => {
    if (!user) return;
    const newRole = user.role === 'student' ? 'creator' : 'student';
    await switchRole(user.id, newRole);
    setUser({ ...user, role: newRole });
  }, [user]);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadUser();
  }, [loadUser]);

  return (
    <UserContext.Provider value={{ user, loading, error, notInTelegram, toggleRole, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
