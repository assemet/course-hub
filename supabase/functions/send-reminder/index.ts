// Lets a course creator nudge an enrolled student via the bot.
//
// The bot token lives only in the TELEGRAM_BOT_TOKEN secret. The caller proves
// who they are with Telegram initData, must own the course, and the student
// must be enrolled in it. The target chat id and course title come from the
// database, never from the request.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json, verifyInitData } from "../_shared/telegram.ts";

const MIN_HOURS_BETWEEN_REMINDERS = 24;

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
      .select("id, last_reminded_at, users!inner ( telegram_id )")
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
    const text =
      `📚 Don't forget about your course "${title}"!\n\n` +
      `You haven't been active in a while. Jump back in and continue where you left off.`;

    // No parse_mode: the course title is user-controlled text.
    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: student.telegram_id, text }),
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
