import { supabase } from './supabase';
import { getTelegramInitData } from './telegram';

export interface InactiveStudent {
  user_id: string;
  course_id: string;
  first_name: string;
  username: string | null;
  last_activity_at: string;
  course_title: string;
}

/** Students enrolled in the creator's courses with no activity for `hours`. */
export async function fetchInactiveStudents(creatorId: string, hours = 24): Promise<InactiveStudent[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      user_id,
      course_id,
      last_activity_at,
      users!inner ( first_name, username ),
      courses!inner ( title, creator_id )
    `)
    .eq('courses.creator_id', creatorId)
    .lt('last_activity_at', cutoff);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as { first_name: string; username: string | null };
    const course = row.courses as { title: string };
    return {
      user_id: row.user_id as string,
      course_id: row.course_id as string,
      first_name: user.first_name,
      username: user.username,
      last_activity_at: row.last_activity_at as string,
      course_title: course.title,
    };
  });
}

/**
 * Asks the server to message an enrolled student. The bot token stays on the
 * server; the caller is verified from Telegram initData and must own the course.
 */
export async function sendReminderNotification(
  courseId: string,
  studentUserId: string
): Promise<{ sent: boolean; note: string }> {
  try {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminder`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        init_data: getTelegramInitData(),
        course_id: courseId,
        student_id: studentUserId,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.sent) {
      return { sent: true, note: 'Reminder sent successfully.' };
    }
    return { sent: false, note: data.error || `Request failed (${response.status})` };
  } catch (err) {
    return {
      sent: false,
      note: err instanceof Error ? err.message : 'Network error occurred.',
    };
  }
}
