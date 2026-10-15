import type { User } from './types';
import { getTelegramInitData } from './telegram';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Refresh the token a little before it actually expires.
const REFRESH_MARGIN_SECONDS = 60;

interface Session {
  token: string;
  expiresAt: number; // unix seconds
  user: User;
}

let session: Session | null = null;
let inflight: Promise<Session> | null = null;

async function requestSession(initData: string): Promise<Session> {
  const res = await fetch(`${supabaseUrl}/functions/v1/auth-telegram`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey ?? '',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ init_data: initData }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token || !body.user) {
    throw new Error(body.error || `Sign-in failed (${res.status})`);
  }
  return { token: body.token, expiresAt: body.expires_at, user: body.user as User };
}

/** Verifies the Telegram session server-side and stores the resulting JWT. */
export function signIn(): Promise<Session> {
  const initData = getTelegramInitData();
  if (!initData) return Promise.reject(new Error('Telegram session data is missing'));

  // Collapse concurrent callers (e.g. several queries firing at once) into one request.
  if (!inflight) {
    inflight = requestSession(initData)
      .then((s) => {
        session = s;
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Returns a valid access token, renewing it when it is about to expire. */
export async function getAccessToken(): Promise<string | null> {
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - now > REFRESH_MARGIN_SECONDS) return session.token;
  try {
    return (await signIn()).token;
  } catch {
    return null;
  }
}
