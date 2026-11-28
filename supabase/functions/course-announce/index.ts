// course-announce: the creator sends one message to every enrolled student.
//
// Request: { init_data, course_id, text }. Only the course's creator, only for
// a published course, at most MAX_PER_DAY announcements per course a day (many
// messages make students block the bot, which also stops reminders and lesson
// files). The announcement is saved (students also see the latest one on the
// course page), then sent in batches under Telegram's rate limit.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, getBotUsername, json, verifyInitData } from "../_shared/telegram.ts";

type Lang = "ar" | "en";

const MAX_PER_DAY = 3;
const MAX_LENGTH = 1000;
/** Telegram allows about 30 messages a second in total: send 25, then wait out the second. */
const BATCH = 25;

function pickLang(code: string | null | undefined): Lang {
  const c = code?.toLowerCase();
  return c && !c.startsWith("ar") ? "en" : "ar";
}

export function announcementText(lang: Lang, course: string, body: string): string {
  return lang === "ar" ? `📢 إعلان من دورة «${course}»\n\n${body}` : `📢 Announcement from "${course}"\n\n${body}`;
}

const buttonLabel: Record<Lang, string> = { ar: "📚 فتح الدورة", en: "📚 Open the course" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(botToken: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: data?.ok === true, status: res.status, retryAfter: data?.parameters?.retry_after as number | undefined };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    console.error("course-announce: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";
    const courseId = typeof body?.course_id === "string" ? body.course_id : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!courseId) return json({ error: "course_id is required" }, 400);
    if (text.length < 1 || text.length > MAX_LENGTH) return json({ error: "invalid_length" }, 400);

    const caller = await verifyInitData(initData, botToken);
    if (!caller) return json({ error: "Invalid Telegram session" }, 401);

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: me } = await db.from("users").select("id").eq("telegram_id", caller.id).maybeSingle();
    if (!me) return json({ error: "Unknown user" }, 403);

    const { data: course } = await db.from("courses").select("id, title, creator_id, status").eq("id", courseId).maybeSingle();
    if (!course || course.creator_id !== me.id) return json({ error: "Not your course" }, 403);
    if (course.status !== "published") return json({ error: "not_published" }, 409);

    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { count: today } = await db
      .from("course_announcements")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .gte("created_at", since);
    if ((today ?? 0) >= MAX_PER_DAY) return json({ error: "daily_limit" }, 429);

    const { data: enrolled, error: enrErr } = await db
      .from("enrollments")
      .select("user_id, users!inner ( telegram_id, language_code )")
      .eq("course_id", courseId)
      .neq("user_id", me.id);
    if (enrErr) throw enrErr;
    const recipients = (enrolled ?? [])
      .map((e) => e.users as unknown as { telegram_id: number | null; language_code: string | null })
      .filter((u) => !!u?.telegram_id);

    const { data: row, error: insErr } = await db
      .from("course_announcements")
      .insert({ course_id: courseId, author_id: me.id, body: text, recipients: recipients.length })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const username = await getBotUsername(botToken);
    const title = String(course.title).slice(0, 120);
    const sendOne = async (user: (typeof recipients)[number]) => {
      const lang = pickLang(user.language_code);
      const params = {
        chat_id: user.telegram_id,
        // No parse_mode: the announcement is the creator's own text.
        text: announcementText(lang, title, text),
        reply_markup: username
          ? { inline_keyboard: [[{ text: buttonLabel[lang], url: `https://t.me/${username}/app?startapp=course_${courseId}` }]] }
          : undefined,
      };
      let r = await send(botToken, params);
      if (!r.ok && r.status === 429 && r.retryAfter && r.retryAfter <= 10) {
        await sleep(r.retryAfter * 1000);
        r = await send(botToken, params);
      }
      // 403 = the student blocked the bot or never started it: not delivered.
      return r.ok;
    };

    // ~25 a second: 1,000 students take about 40 seconds.
    let delivered = 0;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const started = Date.now();
      const results = await Promise.all(recipients.slice(i, i + BATCH).map(sendOne));
      delivered += results.filter(Boolean).length;
      const rest = 1000 - (Date.now() - started);
      if (i + BATCH < recipients.length && rest > 0) await sleep(rest);
    }

    await db.from("course_announcements").update({ delivered }).eq("id", row.id);
    return json({ id: row.id, recipients: recipients.length, delivered, remaining_today: MAX_PER_DAY - (today ?? 0) - 1 });
  } catch (err) {
    console.error("course-announce error:", err);
    return json({ error: "Failed to send the announcement" }, 500);
  }
});
