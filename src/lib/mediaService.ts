import { getTelegramInitData } from './telegram';

/**
 * Talks to the `lesson-media` Edge Function, which holds the bot token and
 * checks that the caller may see the lesson.
 */
async function callLessonMedia(lessonId: string, action: 'view' | 'send'): Promise<Response> {
  return callMediaFunction({ lesson_id: lessonId, action });
}

async function callMediaFunction(params: Record<string, string>, fn = 'lesson-media'): Promise<Response> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ init_data: getTelegramInitData(), ...params }),
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

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

export interface RefreshThumbsResult {
  /** Lessons that got a preview in this call. */
  updated: number;
  /** Lessons whose file has no preview (checked, won't be tried again). */
  without: number;
  /** Lessons still to check: call again while this is above 0. */
  remaining: number;
}

/**
 * Recovers previews for a course's lessons that have none (imported before
 * thumbnails were kept). The bot re-sends each file to the creator's chat and
 * deletes it at once; see the `refresh-thumbnails` function.
 */
export async function refreshCourseThumbnails(courseId: string): Promise<RefreshThumbsResult> {
  const response = await callMediaFunction({ course_id: courseId }, 'refresh-thumbnails');
  if (!response.ok) throw new Error(await errorCode(response));
  const data = await response.json();
  return {
    updated: Number(data?.updated) || 0,
    without: Number(data?.without) || 0,
    remaining: Number(data?.remaining) || 0,
  };
}

/** Lessons with a file but no preview checked yet (null; "" means checked, none). */
export function needsThumbnail(lesson: { media_file_id: string | null; media_kind: string | null; media_thumb_file_id: string | null }): boolean {
  return !!lesson.media_file_id && !!lesson.media_kind && lesson.media_thumb_file_id === null;
}

export type ThumbSource = { lessonId: string } | { importId: string };

// Object URLs live for the whole session, so lists don't refetch on revisit.
const thumbCache = new Map<string, Promise<string | null>>();

// A course page can ask for dozens at once; keep the server load polite.
const MAX_PARALLEL = 4;
let active = 0;
const queue: Array<() => void> = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => queue.push(resolve));
  active++;
  try {
    return await task();
  } finally {
    active--;
    queue.shift()?.();
  }
}

/** Object URL of the preview image, or null if there is none. Cached per session. */
export function loadThumbnail(source: ThumbSource): Promise<string | null> {
  const key = 'lessonId' in source ? `l:${source.lessonId}` : `i:${source.importId}`;
  let pending = thumbCache.get(key);
  if (!pending) {
    pending = limited(async () => {
      const params: Record<string, string> =
        'lessonId' in source ? { lesson_id: source.lessonId } : { import_id: source.importId };
      const response = await callMediaFunction({ ...params, action: 'thumb' });
      if (!response.ok) return null;
      return URL.createObjectURL(await response.blob());
    }).catch(() => null);
    // Don't cache failures (e.g. offline): allow a retry next time.
    pending.then((url) => url === null && thumbCache.delete(key));
    thumbCache.set(key, pending);
  }
  return pending;
}

/** 75 -> "1:15", 3723 -> "1:02:03" */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds < 0) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
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
