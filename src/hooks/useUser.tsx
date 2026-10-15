import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@/lib/types';
import { signInWithTelegram, switchRole } from '@/lib/auth';
import { initTelegramWebApp, isRunningInTelegram, getTelegramInitData } from '@/lib/telegram';

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

// On Telegram Web/Desktop, initData may not be populated immediately —
// poll for up to ~3 seconds after ready() is called.
const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 3000;

function waitForInitData(): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (getTelegramInitData()) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= POLL_TIMEOUT_MS) {
        resolve(false);
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
      // We're inside Telegram but initData might not be populated yet.
      // Poll for it rather than immediately showing the fallback screen.
      const hasInitData = await waitForInitData();
      if (!hasInitData) {
        setNotInTelegram(true);
        setLoading(false);
        return;
      }
      // The signed initData is verified server-side; the client never decides identity.
      const dbUser = await signInWithTelegram();
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
    setUser((current) => (current ? { ...current, role: newRole } : current));
  }, [user]);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotInTelegram(false);
    await loadUser();
  }, [loadUser]);

  return (
    <UserContext.Provider value={{ user, loading, error, notInTelegram, toggleRole, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  return useContext(UserContext);
}
