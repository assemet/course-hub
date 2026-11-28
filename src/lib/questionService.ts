import { supabase } from './supabase';
import { getTelegramInitData } from './telegram';

/**
 * Lesson questions (students ask, the course's creator answers) and course
 * announcements. Writes go through database functions (ask/answer/delete) and
 * the bot messages through Edge Functions; see migration 011.
 */

export interface LessonQuestion {
  id: string;
  lesson_id: string;
  course_id: string;
  author_id: string;
  body: string;
  is_private: boolean;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  author: { first_name: string | null; photo_url: string | null } | null;
}

/** A question in the creator's inbox, with where it was asked. */
export interface InboxQuestion extends LessonQuestion {
  lesson: { title: string } | null;
}

export interface CourseAnnouncement {
  id: string;
  course_id: string;
  body: string;
  recipients: number;
  delivered: number;
  created_at: string;
}

const QUESTION_COLUMNS =
  'id, lesson_id, course_id, author_id, body, is_private, answer, answered_at, created_at, author:users!author_id(first_name, photo_url)';

/** Questions under a lesson that the current user may see (RLS decides), oldest first. */
export async function fetchLessonQuestions(lessonId: string): Promise<LessonQuestion[]> {
  const { data, error } = await supabase
    .from('lesson_questions')
    .select(QUESTION_COLUMNS)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LessonQuestion[];
}

/** Unanswered questions across the creator's courses, oldest first (answer those first). */
export async function fetchUnansweredQuestions(courseIds: string[]): Promise<InboxQuestion[]> {
  if (courseIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lesson_questions')
    .select(`${QUESTION_COLUMNS}, lesson:lessons(title)`)
    .in('course_id', courseIds)
    .is('answered_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as InboxQuestion[];
}

export async function countUnansweredQuestions(courseIds: string[]): Promise<number> {
  if (courseIds.length === 0) return 0;
  const { count, error } = await supabase
    .from('lesson_questions')
    .select('id', { count: 'exact', head: true })
    .in('course_id', courseIds)
    .is('answered_at', null);
  if (error) throw error;
  return count ?? 0;
}

async function callFunction(name: string, params: Record<string, unknown>): Promise<Response> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ init_data: getTelegramInitData(), ...params }),
  });
}

/** Tells the other side through the bot. Best-effort: the question/answer is saved either way. */
function notify(questionId: string, event: 'asked' | 'answered'): void {
  callFunction('question-notify', { question_id: questionId, event }).catch(() => undefined);
}

export type AskError = 'too_many' | 'failed';

export async function askQuestion(lessonId: string, body: string, isPrivate: boolean): Promise<string> {
  const { data, error } = await supabase.rpc('ask_question', {
    p_lesson_id: lessonId,
    p_body: body,
    p_private: isPrivate,
  });
  if (error) throw new Error(error.code === '54000' ? 'too_many' : 'failed');
  const id = data as string;
  notify(id, 'asked');
  return id;
}

/** Saves (or edits) the answer; the student is told the first time only. */
export async function answerQuestion(questionId: string, answer: string): Promise<void> {
  const { error } = await supabase.rpc('answer_question', { p_question_id: questionId, p_answer: answer });
  if (error) throw error;
  notify(questionId, 'answered');
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_question', { p_question_id: questionId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const ANNOUNCEMENTS_PER_DAY = 3;
export const ANNOUNCEMENT_MAX_LENGTH = 1000;

export async function fetchAnnouncements(courseId: string, limit = 10): Promise<CourseAnnouncement[]> {
  const { data, error } = await supabase
    .from('course_announcements')
    .select('id, course_id, body, recipients, delivered, created_at')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CourseAnnouncement[];
}

export type AnnounceResult =
  | { ok: true; recipients: number; delivered: number }
  | { ok: false; error: 'daily_limit' | 'not_published' | 'failed' };

export async function sendAnnouncement(courseId: string, text: string): Promise<AnnounceResult> {
  try {
    const response = await callFunction('course-announce', { course_id: courseId, text });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return { ok: true, recipients: Number(data?.recipients) || 0, delivered: Number(data?.delivered) || 0 };
    }
    const error = data?.error === 'daily_limit' || data?.error === 'not_published' ? data.error : 'failed';
    return { ok: false, error };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Announcements sent in the last 24 hours (the limit is per rolling day). */
export function sentToday(announcements: CourseAnnouncement[], now = Date.now()): number {
  return announcements.filter((a) => now - new Date(a.created_at).getTime() < 24 * 3_600_000).length;
}
