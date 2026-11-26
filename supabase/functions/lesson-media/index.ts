// Serves the Telegram file attached to a lesson.
//
//   action "view":  returns the image bytes so the Mini App can show it inline.
//                   Images only (the Bot API can download files up to 20 MB).
//   action "thumb": returns the small preview image (video frame, PDF first
//                   page, ...). Also works for Import Inbox items (`import_id`
//                   instead of `lesson_id`), which only their creator can read.
//   action "send":  the bot sends the file to the caller's own Telegram chat.
//                   Works for any type and size, including videos, and for
//                   files that came from private channels.
//
// Who is asking comes from Telegram initData (verified with the bot token).
// Whether they may see the lesson is decided by the database's own RLS: the
// lesson is read with a short-lived JWT for that user, exactly as the app would
// read it. Any future rule (e.g. paid lessons) applies here automatically.
//
// Required secrets: TELEGRAM_BOT_TOKEN, APP_JWT_SECRET (same as auth-telegram).
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json, signJwt, verifyInitData } from "../_shared/telegram.ts";

type FileKind = "photo" | "video" | "video_note" | "animation" | "document" | "audio" | "voice";

interface LessonMedia {
  title: string;
  media_type: string | null;
  media_kind: FileKind | null;
  media_file_id: string | null;
  media_file_name: string | null;
  media_mime_type: string | null;
  media_thumb_file_id: string | null;
}

/** Bot API method and its file parameter for each kind of file_id. */
const SEND_METHOD: Record<FileKind, [method: string, field: string]> = {
  photo: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  video_note: ["sendVideoNote", "video_note"],
  animation: ["sendAnimation", "animation"],
  document: ["sendDocument", "document"],
  audio: ["sendAudio", "audio"],
  voice: ["sendVoice", "voice"],
};

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // Bot API getFile limit

type Action = "view" | "thumb" | "send";
const ACTIONS: Action[] = ["view", "thumb", "send"];

/** Streams a Telegram file (<= 20 MB) back as an image response. */
async function imageResponse(botToken: string, fileId: string, mimeType: string | null): Promise<Response> {
  const fileInfo = await botApi(botToken, "getFile", { file_id: fileId });
  const filePath = fileInfo.result?.file_path as string | undefined;
  // "file is too big" is the usual reason; the client falls back to "send".
  if (!fileInfo.ok || !filePath) return json({ error: "too_big" }, 413);
  if (typeof fileInfo.result?.file_size === "number" && fileInfo.result.file_size > MAX_DOWNLOAD_BYTES) {
    return json({ error: "too_big" }, 413);
  }

  const file = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!file.ok || !file.body) return json({ error: "file_unavailable" }, 502);

  return new Response(file.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": mimeType?.startsWith("image/") ? mimeType : "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}

async function botApi(botToken: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: data?.ok === true, result: data?.result, description: data?.description as string | undefined };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const jwtSecret = Deno.env.get("APP_JWT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !jwtSecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("lesson-media: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";
    const lessonId = typeof body?.lesson_id === "string" ? body.lesson_id : "";
    const importId = typeof body?.import_id === "string" ? body.import_id : "";
    const action: Action | null = ACTIONS.includes(body?.action) ? body.action : null;
    if (!action || (!lessonId && !importId)) {
      return json({ error: "lesson_id (or import_id) and action are required" }, 400);
    }
    if (importId && action !== "thumb") return json({ error: "Only thumbnails are available for imports" }, 400);

    const tgUser = await verifyInitData(initData, botToken);
    if (!tgUser) return json({ error: "Invalid Telegram session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: user } = await admin
      .from("users")
      .select("id")
      .eq("telegram_id", tgUser.id)
      .maybeSingle();
    if (!user) return json({ error: "User not found" }, 401);

    // Read the lesson as this user, so RLS decides what they may see.
    const { token } = await signJwt(
      { aud: "authenticated", role: "authenticated", sub: user.id, telegram_id: tgUser.id },
      jwtSecret,
      60,
    );
    const asUser = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Import Inbox preview: RLS only lets creators read their own imports.
    if (importId) {
      const { data: item, error: itemErr } = await asUser
        .from("imported_messages")
        .select("thumb_file_id")
        .eq("id", importId)
        .maybeSingle<{ thumb_file_id: string | null }>();
      if (itemErr) throw itemErr;
      if (!item?.thumb_file_id) return json({ error: "not_found" }, 404);
      return await imageResponse(botToken, item.thumb_file_id, "image/jpeg");
    }

    const { data: lesson, error: lessonErr } = await asUser
      .from("lessons")
      .select("title, media_type, media_kind, media_file_id, media_file_name, media_mime_type, media_thumb_file_id")
      .eq("id", lessonId)
      .maybeSingle<LessonMedia>();
    if (lessonErr) throw lessonErr;
    if (!lesson?.media_file_id || !lesson.media_kind) return json({ error: "not_found" }, 404);

    if (action === "thumb") {
      if (!lesson.media_thumb_file_id) return json({ error: "not_found" }, 404);
      return await imageResponse(botToken, lesson.media_thumb_file_id, "image/jpeg");
    }

    if (action === "send") {
      const [method, field] = SEND_METHOD[lesson.media_kind];
      const params: Record<string, unknown> = { chat_id: tgUser.id, [field]: lesson.media_file_id };
      // Video notes cannot have captions; everything else gets the lesson title.
      if (lesson.media_kind !== "video_note") params.caption = lesson.title.slice(0, 1024);

      const sent = await botApi(botToken, method, params);
      if (sent.ok) return json({ sent: true });
      // 403: the user never started the bot or blocked it.
      if (sent.status === 403) return json({ error: "chat_unavailable" }, 409);
      console.error("lesson-media send failed:", sent.status, sent.description);
      return json({ error: "file_unavailable" }, 502);
    }

    // action === "view": inline images only.
    if (lesson.media_type !== "image") return json({ error: "not_viewable" }, 400);
    return await imageResponse(botToken, lesson.media_file_id, lesson.media_mime_type);
  } catch (err) {
    console.error("lesson-media error:", err);
    return json({ error: "Failed to load media" }, 500);
  }
});
