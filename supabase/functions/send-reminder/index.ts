// Lets a course creator nudge an enrolled student via the bot.
//
// The bot token lives only in the TELEGRAM_BOT_TOKEN secret. The caller proves
// who they are with Telegram initData, must own the course, and the student
// must be enrolled in it. The target chat id and course title come from the
// database, never from the request.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json, verifyInitData } from "../_shared/telegram.ts";

const MIN_HOURS_BETWEEN_REMINDERS = 24;

type Lang = "ar" | "en";

/** Same rule as the Mini App: Arabic unless the user's Telegram is in another language. */
function pickLang(code: string | null | undefined): Lang {
  const c = code?.toLowerCase();
  return c && !c.startsWith("ar") ? "en" : "ar";
}

function reminderText(lang: Lang, title: string, done: number, total: number, current: string | null): string {
  if (lang === "ar") {
    const progress = done === 0
      ? "لم تبدأ بعد، والدرس الأول بانتظارك."
      : `أنجزت ${done} من ${total} دروس. تابع من حيث توقفت 💪`;
    const where = current && done > 0 ? `\nآخر درس فتحته: «${current}»` : "";
    return `📚 تذكير بدورة «${title}»\n\n${progress}${where}`;
  }
  const progress = done === 0
    ? "You haven't started yet. The first lesson is waiting for you."
    : `You've completed ${done} of ${total} lessons. Pick up where you left off 💪`;
  const where = current && done > 0 ? `\nLast lesson you opened: "${current}"` : "";
  return `📚 A reminder about "${title}"\n\n${progress}${where}`;
}

const buttonLabel: Record<Lang, string> = { ar: "▶️ متابعة الدورة", en: "▶️ Continue the course" };

// The bot's username, for the "continue" link. Cached for the instance's life.
let botUsername: string | null = null;
async function getBotUsername(botToken: string): Promise<string | null> {
  if (botUsername) return botUsername;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).catch(() => null);
  const data = await res?.json().catch(() => null);
  botUsername = typeof data?.result?.username === "string" ? data.result.username : null;
  return botUsername;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    console.error("send-reminder: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";
    const courseId = typeof body?.course_id === "string" ? body.course_id : "";
    const studentId = typeof body?.student_id === "string" ? body.student_id : "";
    if (!courseId || !studentId) {
      return json({ error: "course_id and student_id are required" }, 400);
    }

    const caller = await verifyInitData(initData, botToken);
    if (!caller) return json({ error: "Invalid Telegram session" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerRow } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", caller.id)
      .maybeSingle();
    if (!callerRow) return json({ error: "Unknown user" }, 403);

    const { data: course } = await supabase
      .from("courses")
      .select("id, title, creator_id")
      .eq("id", courseId)
      .maybeSingle();
    if (!course || course.creator_id !== callerRow.id) {
      return json({ error: "You can only remind students of your own courses" }, 403);
    }

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, user_id, last_lesson_id, last_reminded_at, users!inner ( telegram_id )")
      .eq("course_id", courseId)
      .eq("user_id", studentId)
      .maybeSingle();
    if (!enrollment) return json({ error: "Student is not enrolled in this course" }, 404);

    if (enrollment.last_reminded_at) {
      const hoursSince = (Date.now() - new Date(enrollment.last_reminded_at).getTime()) / 3_600_000;
      if (hoursSince < MIN_HOURS_BETWEEN_REMINDERS) {
        return json({ sent: false, error: "This student was reminded recently" }, 429);
      }
    }

    const student = enrollment.users as unknown as { telegram_id: number };
    const title = String(course.title).slice(0, 200);

    // Optional details; a failure here must not block the reminder.
    const [langRow, progress, moduleRows, currentLesson] = await Promise.all([
      supabase.from("users").select("language_code").eq("id", enrollment.user_id).maybeSingle(),
      supabase
        .from("lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("course_id", courseId)
        .eq("user_id", enrollment.user_id)
        .eq("completed", true),
      supabase.from("modules").select("id").eq("course_id", courseId),
      enrollment.last_lesson_id
        ? supabase.from("lessons").select("title").eq("id", enrollment.last_lesson_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const moduleIds = (moduleRows.data ?? []).map((m: { id: string }) => m.id);
    const { count: totalLessons } = moduleIds.length
      ? await supabase.from("lessons").select("id", { count: "exact", head: true }).in("module_id", moduleIds)
      : { count: 0 };

    const lang = pickLang(langRow.data?.language_code);
    const done = progress.count ?? 0;
    const total = Math.max(totalLessons ?? 0, done);
    const current = currentLesson.data?.title ? String(currentLesson.data.title).slice(0, 120) : null;
    const text = reminderText(lang, title, done, total, current);

    const username = await getBotUsername(botToken);
    const replyMarkup = username
      ? { inline_keyboard: [[{ text: buttonLabel[lang], url: `https://t.me/${username}/app?startapp=course_${courseId}` }]] }
      : undefined;

    // No parse_mode: the course and lesson titles are user-controlled text.
    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: student.telegram_id, text, reply_markup: replyMarkup }),
    });
    const tgData = await tgResponse.json().catch(() => ({}));

    if (!tgData.ok) {
      return json({ sent: false, error: tgData.description || "Telegram API returned an error" }, 502);
    }

    await supabase
      .from("enrollments")
      .update({ last_reminded_at: new Date().toISOString() })
      .eq("id", enrollment.id);

    return json({ sent: true, message_id: tgData.result?.message_id });
  } catch (err) {
    console.error("send-reminder error:", err);
    return json({ error: "Failed to send reminder" }, 500);
  }
});
