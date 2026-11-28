import { supabase } from './supabase';
import { getTelegramInitData } from './telegram';

/** One enrolled student, as returned by the creator_course_students() function. */
export interface CourseStudent {
  user_id: string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  enrolled_at: string;
  last_activity_at: string;
  last_reminded_at: string | null;
  completed_lessons: number;
  current_lesson_title: string | null;
}

/**
 * Students of a course with their progress. Only the course owner may call it
 * (checked in the database); students' raw progress rows stay private.
 */
export async function fetchCourseStudents(courseId: string): Promise<CourseStudent[]> {
  const { data, error } = await supabase.rpc('creator_course_students', { p_course_id: courseId });
  if (error) throw error;
  return (data ?? []) as CourseStudent[];
}

/** lessonId -> number of (still enrolled) students who completed it. */
export async function fetchLessonStats(courseId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('creator_lesson_stats', { p_course_id: courseId });
  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<{ lesson_id: string; completed_count: number }>).map((r) => [r.lesson_id, r.completed_count])
  );
}

/** A student counts as inactive after this many days without opening a lesson. */
export const INACTIVE_AFTER_DAYS = 3;
/** Matches MIN_HOURS_BETWEEN_REMINDERS in the send-reminder function. */
export const REMINDER_COOLDOWN_HOURS = 24;

const HOUR = 3_600_000;

export function isInactive(student: CourseStudent, now = Date.now()): boolean {
  return now - new Date(student.last_activity_at).getTime() > INACTIVE_AFTER_DAYS * 24 * HOUR;
}

export function remindedRecently(student: CourseStudent, now = Date.now()): boolean {
  return !!student.last_reminded_at && now - new Date(student.last_reminded_at).getTime() < REMINDER_COOLDOWN_HOURS * HOUR;
}

export type ExportResult = 'sent' | 'chat_unavailable' | 'failed';

/**
 * The bot sends the creator an Excel file with the course's students, their
 * progress, quiz results and certificates (see the `students-export` function).
 */
export async function exportStudentsToChat(courseId: string): Promise<ExportResult> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/students-export`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        init_data: getTelegramInitData(),
        course_id: courseId,
        // Excel dates have no time zone: write them in the creator's local time.
        tz_offset_minutes: -new Date().getTimezoneOffset(),
      }),
    });
    if (response.ok) return 'sent';
    const data = await response.json().catch(() => ({}));
    return data?.error === 'chat_unavailable' ? 'chat_unavailable' : 'failed';
  } catch {
    return 'failed';
  }
}
