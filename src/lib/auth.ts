import { supabase } from './supabase';
import { signIn } from './session';
import type { User } from './types';

/** Signs in with Telegram (verified server-side) and returns the app user. */
export async function signInWithTelegram(): Promise<User> {
  const { user } = await signIn();
  return user;
}

export async function switchRole(userId: string, role: 'student' | 'creator'): Promise<void> {
  const { error } = await supabase.from('users').update({ role }).eq('id', userId);
  if (error) throw error;
}
