// question-notify: tells the other side about a lesson question, via the bot.
//
//   event "asked"    -> the course's creator gets the question (caller: its author)
//   event "answered" -> the student gets the teacher's answer (caller: the creator)
//
// The app calls this right after ask_question() / answer_question() succeed.
// Each message goes out once: teacher_notified_at / student_notified_at are set
// here, so a repeated call (or a later edit of the answer) sends nothing.
// Chat ids, names and texts come from the database, never from the request.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, getBotUsername, json, verifyInitData } from "../_shared/telegram.ts";

type Lang = "ar" | "en";
type Event = "asked" | "answered";

/** Same rule as the Mini App: Arabic unless the user's Telegram is in another language. */
function pickLang(code: string | null | undefined): Lang {
  const c = code?.toLowerCase();
  return c && !c.startsWith("ar") ? "en" : "ar";
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function askedText(lang: Lang, p: { lesson: string; course: string; body: string; student: string; isPrivate: boolean }) {
  const priv = p.isPrivate ? (lang === "ar" ? " (سؤال خاص)" : " (private)") : "";
  return lang === "ar"
    ? `❓ سؤال جديد${priv} من ${p.student}\nفي درس «${p.lesson}» — ${p.course}\n\n${p.body}`
    : `❓ New question${priv} from ${p.student}\nOn "${p.lesson}" — ${p.course}\n\n${p.body}`;
}

export function answeredText(lang: Lang, p: { lesson: string; body: string; answer: string }) {
  return lang === "ar"
    ? `💬 ردّ المدرس على سؤالك في درس «${p.lesson}»\n\nسؤالك: ${p.body}\n\nالرد: ${p.answer}`
    : `💬 Your teacher answered your question on "${p.lesson}"\n\nYou asked: ${p.body}\n\nAnswer: ${p.answer}`;
}

const buttonLabel: Record<Event, Record<Lang, string>> = {
  asked: { ar: "✍️ الرد على السؤال", en: "✍️ Answer it" },
  answered: { ar: "📖 فتح الدرس", en: "📖 Open the lesson" },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    console.error("question-notify: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";
    const questionId = typeof body?.question_id === "string" ? body.question_id : "";
    const event: Event | null = body?.event === "asked" || body?.event === "answered" ? body.event : null;
    if (!questionId || !event) return json({ error: "question_id and event are required" }, 400);

    const caller = await verifyInitData(initData, botToken);
    if (!caller) return json({ error: "Invalid Telegram session" }, 401);

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: me } = await db.from("users").select("id").eq("telegram_id", caller.id).maybeSingle();
    if (!me) return json({ error: "Unknown user" }, 403);

    const { data: q } = await db
      .from("lesson_questions")
      .select("id, lesson_id, course_id, author_id, body, is_private, answer, answered_at, teacher_notified_at, student_notified_at")
      .eq("id", questionId)
      .maybeSingle();
    if (!q) return json({ error: "Question not found" }, 404);

    const [{ data: course }, { data: lesson }] = await Promise.all([
      db.from("courses").select("title, creator_id").eq("id", q.course_id).maybeSingle(),
      db.from("lessons").select("title").eq("id", q.lesson_id).maybeSingle(),
    ]);
    if (!course || !lesson) return json({ error: "Question not found" }, 404);

    // Who may trigger which message, and whether it is still due.
    if (event === "asked") {
      if (q.author_id !== me.id) return json({ error: "Not your question" }, 403);
      if (q.teacher_notified_at) return json({ sent: false, reason: "already_sent" });
    } else {
      if (course.creator_id !== me.id) return json({ error: "Not your course" }, 403);
      if (!q.answered_at || !q.answer) return json({ error: "Not answered yet" }, 409);
      if (q.student_notified_at) return json({ sent: false, reason: "already_sent" });
    }

    const recipientId = event === "asked" ? course.creator_id : q.author_id;
    const [{ data: recipient }, { data: author }] = await Promise.all([
      db.from("users").select("telegram_id, language_code").eq("id", recipientId).maybeSingle(),
      db.from("users").select("first_name, username").eq("id", q.author_id).maybeSingle(),
    ]);
    if (!recipient?.telegram_id) return json({ sent: false, reason: "no_chat" });

    const lang = pickLang(recipient.language_code);
    const lessonTitle = clip(String(lesson.title), 120);
    const text = event === "asked"
      ? askedText(lang, {
          lesson: lessonTitle,
          course: clip(String(course.title), 120),
          body: clip(String(q.body), 2000),
          student: clip(String(author?.first_name || author?.username || (lang === "ar" ? "طالب" : "a student")), 60),
          isPrivate: q.is_private,
        })
      : answeredText(lang, { lesson: lessonTitle, body: clip(String(q.body), 600), answer: clip(String(q.answer), 3000) });

    const username = await getBotUsername(botToken);
    // q_<lesson id> opens the lesson (and its questions) in the Mini App.
    const replyMarkup = username
      ? { inline_keyboard: [[{ text: buttonLabel[event][lang], url: `https://t.me/${username}/app?startapp=q_${q.lesson_id}` }]] }
      : undefined;

    // No parse_mode: questions, answers and titles are user-written text.
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: recipient.telegram_id, text, reply_markup: replyMarkup }),
    });
    const tg = await res.json().catch(() => ({}));
    if (!tg.ok) {
      // 403: they never started the bot or blocked it. Nothing to retry.
      console.error("question-notify: sendMessage failed", res.status, tg.description);
      return json({ sent: false, reason: res.status === 403 ? "chat_unavailable" : "telegram_error" });
    }

    await db
      .from("lesson_questions")
      .update(event === "asked" ? { teacher_notified_at: new Date().toISOString() } : { student_notified_at: new Date().toISOString() })
      .eq("id", q.id);
    return json({ sent: true });
  } catch (err) {
    console.error("question-notify error:", err);
    return json({ error: "Failed to notify" }, 500);
  }
});
