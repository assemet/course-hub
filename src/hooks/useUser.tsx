import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@/lib/types';
import { getCurrentTelegramUser, getOrCreateUser, switchRole } from '@/lib/auth';
import { initTelegramWebApp, isRunningInTelegram } from '@/lib/telegram';

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

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notInTelegram, setNotInTelegram] = useState(false);

  const loadUser = useCallback(async () => {
    if (!isRunningInTelegram()) {
      setNotInTelegram(true);
      setLoading(false);
      return;
    }

    try {
      initTelegramWebApp();
      const tgUser = getCurrentTelegramUser();
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
