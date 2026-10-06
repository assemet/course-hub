import { supabase } from './supabase';
import type { User } from './types';
import { getTelegramUser, type TelegramUserData } from './telegram';

export function getCurrentTelegramUser(): TelegramUserData | null {
  return getTelegramUser();
}

export async function getOrCreateUser(telegramData: TelegramUserData): Promise<User> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramData.id)
    .maybeSingle();

  if (existing) {
    const needsUpdate =
      existing.first_name !== (telegramData.first_name ?? 'Student') ||
      existing.username !== (telegramData.username ?? null) ||
      existing.photo_url !== (telegramData.photo_url ?? null);

    if (needsUpdate) {
      const { data: updated, error } = await supabase
        .from('users')
        .update({
          first_name: telegramData.first_name ?? existing.first_name,
          username: telegramData.username ?? null,
          photo_url: telegramData.photo_url ?? null,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return updated as User;
    }
    return existing as User;
  }

  const { data: created, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramData.id,
      username: telegramData.username ?? null,
      first_name: telegramData.first_name ?? 'Student',
      photo_url: telegramData.photo_url ?? null,
      role: 'student',
    })
    .select()
    .single();

  if (error) throw error;
  return created as User;
}

export async function switchRole(userId: string, role: 'student' | 'creator'): Promise<void> {
  const { error } = await supabase.from('users').update({ role }).eq('id', userId);
  if (error) throw error;
}
