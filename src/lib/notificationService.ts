import { supabase } from './supabase';

export async function fetchInactiveStudents(hours = 24): Promise<
  Array<{
    user_id: string;
    course_id: string;
    telegram_id: number;
    first_name: string;
    username: string | null;
    last_activity_at: string;
    course_title: string;
  }>
> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      user_id,
      course_id,
      last_activity_at,
      users!inner ( telegram_id, first_name, username ),
      courses!inner ( title )
    `)
    .lt('last_activity_at', cutoff);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as { telegram_id: number; first_name: string; username: string | null };
    const course = row.courses as { title: string };
    return {
      user_id: row.user_id as string,
      course_id: row.course_id as string,
      telegram_id: user.telegram_id,
      first_name: user.first_name,
      username: user.username,
      last_activity_at: row.last_activity_at as string,
      course_title: course.title,
    };
  });
}

export async function sendReminderNotification(
  telegramId: number,
  courseTitle: string
): Promise<{ sent: boolean; note: string }> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminder`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        telegram_id: telegramId,
        course_title: courseTitle,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return {
        sent: false,
        note: errorBody.error || `Request failed (${response.status})`,
      };
    }

    const data = await response.json();
    if (data.sent) {
      return { sent: true, note: 'Reminder sent successfully.' };
    }
    return {
      sent: false,
      note: data.error || 'Failed to send reminder.',
    };
  } catch (err) {
    return {
      sent: false,
      note: err instanceof Error ? err.message : 'Network error occurred.',
    };
  }
}
