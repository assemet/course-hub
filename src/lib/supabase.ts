import { createClient } from '@supabase/supabase-js';
import { getAccessToken } from './session';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in your .env file.'
  );
}

// Requests carry the per-user JWT issued by the `auth-telegram` Edge Function so
// that Row Level Security can scope data with auth.uid(). Before sign-in (no
// token yet) supabase-js falls back to the anon key, which has no table access.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: getAccessToken,
});
