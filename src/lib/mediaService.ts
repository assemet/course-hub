import { getTelegramInitData } from './telegram';

/**
 * Talks to the `lesson-media` Edge Function, which holds the bot token and
 * checks that the caller may see the lesson.
 */
async function callLessonMedia(lessonId: string, action: 'view' | 'send'): Promise<Response> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lesson-media`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ init_data: getTelegramInitData(), lesson_id: lessonId, action }),
  });
}

async function errorCode(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({}));
  return typeof data?.error === 'string' ? data.error : `http_${response.status}`;
}

/** Downloads a lesson image and returns an object URL for <img src>. Revoke it when done. */
export async function loadLessonImage(lessonId: string): Promise<string> {
  const response = await callLessonMedia(lessonId, 'view');
  if (!response.ok) throw new Error(await errorCode(response));
  return URL.createObjectURL(await response.blob());
}

export type SendResult = 'sent' | 'chat_unavailable' | 'failed';

/** Asks the bot to send the lesson's file to the user's own Telegram chat. */
export async function sendLessonMediaToChat(lessonId: string): Promise<SendResult> {
  try {
    const response = await callLessonMedia(lessonId, 'send');
    if (response.ok) return 'sent';
    return (await errorCode(response)) === 'chat_unavailable' ? 'chat_unavailable' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Splits "ملخص الدرس 3.pdf" into { base: "ملخص الدرس 3", ext: "PDF" }.
 * Showing them apart avoids bidi reordering ("pdf.3 ملخص الدرس") in RTL text.
 */
export function splitFileName(name: string | null | undefined): { base: string | null; ext: string | null } {
  if (!name) return { base: null, ext: null };
  const match = name.match(/^(.*\S)\.([A-Za-z0-9]{1,5})$/);
  return match ? { base: match[1], ext: match[2].toUpperCase() } : { base: name, ext: null };
}

/** "2.4 MB", "830 KB" */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
