import { supabase } from './supabase';
import type { ImportedMessage, ImportStatus } from './types';

export async function fetchPendingImports(creatorId: string): Promise<ImportedMessage[]> {
  const { data, error } = await supabase
    .from('imported_messages')
    .select('*')
    .eq('creator_id', creatorId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as ImportedMessage[];
}

export async function fetchAllImports(creatorId: string): Promise<ImportedMessage[]> {
  const { data, error } = await supabase
    .from('imported_messages')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ImportedMessage[];
}

export async function markImportAsImported(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('imported_messages')
    .update({ status: 'imported' as ImportStatus })
    .eq('id', messageId);
  if (error) throw error;
}

export async function deleteImport(messageId: string): Promise<void> {
  const { error } = await supabase.from('imported_messages').delete().eq('id', messageId);
  if (error) throw error;
}

export async function countPendingImports(creatorId: string): Promise<number> {
  const { count, error } = await supabase
    .from('imported_messages')
    .select('*', { count: 'exact', head: true })
    .eq('creator_id', creatorId)
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}

export async function importMessageToLesson(
  message: ImportedMessage,
  courseId: string,
  moduleId: string
): Promise<void> {
  const { data: mod, error: modErr } = await supabase
    .from('modules')
    .select('id')
    .eq('id', moduleId)
    .maybeSingle();
  if (modErr) throw modErr;
  if (!mod) throw new Error('Module not found');

  const { data: existingLessons, error: countErr } = await supabase
    .from('lessons')
    .select('id')
    .eq('module_id', moduleId);
  if (countErr) throw countErr;

  const { error: lessonErr } = await supabase.from('lessons').insert({
    module_id: moduleId,
    title: message.parsed_title ?? 'Untitled Lesson',
    description: null,
    content: message.raw_content ?? null,
    telegram_url: message.media_url ?? null,
    position: existingLessons?.length ?? 0,
  });
  if (lessonErr) throw lessonErr;

  await markImportAsImported(message.id);
}
