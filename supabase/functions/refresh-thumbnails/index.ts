// refresh-thumbnails: finds preview images for lessons imported before
// thumbnails were saved (or added without one).
//
// The Bot API gives no thumbnail for a stored file_id, but re-sending the file
// does: Telegram's reply describes the file, thumbnail included. So for each
// lesson missing a preview, the bot silently sends the file to the creator's
// own chat, keeps the thumbnail's file_id, and deletes the message right away.
// Re-sending by file_id uploads nothing; it is instant.
//
// Request: { init_data, course_id }. Only the course's creator may call it.
// Handles up to BATCH lessons per call and reports how many remain, so the app
// calls it again until `remaining` is 0. A lesson whose file has no preview
// (e.g. a .docx, a voice message) gets "" so it isn't tried again.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, signJwt, verifyInitData } from "../_shared/telegram.ts";

type FileKind = "photo" | "video" | "video_note" | "animation" | "document" | "audio" | "voice";

const SEND_METHOD: Record<FileKind, [method: string, field: string]> = {
  photo: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  video_note: ["sendVideoNote", "video_note"],
  animation: ["sendAnimation", "animation"],
  document: ["sendDocument", "document"],
  audio: ["sendAudio", "audio"],
  voice: ["sendVoice", "voice"],
};

/** Lessons per call: keeps each call well inside the function time limit. */
const BATCH = 15;
/** Pause between files, to stay under Telegram's per-chat rate limit. */
const PAUSE_MS = 400;

interface TgSize {
  file_id?: string;
  width?: number;
  height?: number;
}
interface TgFile {
  duration?: number;
  thumbnail?: TgSize;
  thumb?: TgSize;
}
interface TgSent {
  message_id?: number;
  photo?: TgSize[];
  video?: TgFile;
  video_note?: TgFile;
  animation?: TgFile;
  document?: TgFile;
  audio?: TgFile;
  voice?: TgFile;
}

interface Pending {
  id: string;
  media_kind: FileKind;
  media_file_id: string;
  media_duration: number | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function botApi(botToken: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  return {
    status: res.status,
    ok: data?.ok === true,
    result: data?.result,
    retryAfter: typeof data?.parameters?.retry_after === "number" ? data.parameters.retry_after : null,
  };
}

/** Sends once more after Telegram's "too many requests", if the wait is short. */
async function botApiWithRetry(botToken: string, method: string, params: Record<string, unknown>) {
  const first = await botApi(botToken, method, params);
  if (first.status !== 429 || first.retryAfter === null || first.retryAfter > 10) return first;
  await sleep(first.retryAfter * 1000);
  return botApi(botToken, method, params);
}

/** Thumbnail (and duration) from the message Telegram returned. */
export function previewFromSent(kind: FileKind, sent: TgSent): { thumb: string | null; duration: number | null } {
  if (kind === "photo") {
    const sizes = sent.photo ?? [];
    // The smallest size that still looks sharp in a list, as at import.
    const sharp = sizes.find((s) => Math.min(s.width ?? 0, s.height ?? 0) >= 240) ?? sizes[sizes.length - 1];
    return { thumb: sharp?.file_id ?? null, duration: null };
  }
  const file = sent[kind];
  const thumb = (file?.thumbnail ?? file?.thumb)?.file_id ?? null;
  const duration = typeof file?.duration === "number" && file.duration >= 0 ? Math.round(file.duration) : null;
  return { thumb, duration };
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
    console.error("refresh-thumbnails: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";
    const courseId = typeof body?.course_id === "string" ? body.course_id : "";
    if (!courseId) return json({ error: "course_id is required" }, 400);

    const tgUser = await verifyInitData(initData, botToken);
    if (!tgUser) return json({ error: "Invalid Telegram session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: user } = await admin.from("users").select("id").eq("telegram_id", tgUser.id).maybeSingle();
    if (!user) return json({ error: "User not found" }, 401);

    // Only the creator: checked as that user, so RLS and ownership both apply.
    const { token } = await signJwt(
      { aud: "authenticated", role: "authenticated", sub: user.id, telegram_id: tgUser.id },
      jwtSecret,
      60,
    );
    const asUser = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: course } = await asUser
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("creator_id", user.id)
      .maybeSingle();
    if (!course) return json({ error: "Only the course's creator can do this" }, 403);

    const { data: modules, error: modErr } = await asUser.from("modules").select("id").eq("course_id", courseId);
    if (modErr) throw modErr;
    const moduleIds = (modules ?? []).map((m: { id: string }) => m.id);
    if (moduleIds.length === 0) return json({ updated: 0, without: 0, remaining: 0 });

    const missing = () =>
      asUser
        .from("lessons")
        .select("id, media_kind, media_file_id, media_duration", { count: "exact" })
        .in("module_id", moduleIds)
        .not("media_file_id", "is", null)
        .not("media_kind", "is", null)
        .is("media_thumb_file_id", null);

    const { data: lessons, error: lessonsErr } = await missing().order("id").limit(BATCH);
    if (lessonsErr) throw lessonsErr;

    let updated = 0;
    let without = 0;
    for (const lesson of (lessons ?? []) as Pending[]) {
      const pair = SEND_METHOD[lesson.media_kind];
      if (!pair) continue;
      const [method, field] = pair;

      const sent = await botApiWithRetry(botToken, method, {
        chat_id: tgUser.id,
        [field]: lesson.media_file_id,
        disable_notification: true,
        protect_content: true,
      });
      if (!sent.ok) {
        // 403: the creator blocked the bot, so nothing else will work either.
        if (sent.status === 403) return json({ error: "chat_unavailable" }, 409);
        if (sent.status === 429) break; // try the rest on the next call
        // The file itself is gone or invalid: don't retry it forever.
        await admin.from("lessons").update({ media_thumb_file_id: "" }).eq("id", lesson.id);
        without++;
        continue;
      }

      const message = sent.result as TgSent;
      if (message?.message_id) {
        await botApi(botToken, "deleteMessage", { chat_id: tgUser.id, message_id: message.message_id });
      }

      const { thumb, duration } = previewFromSent(lesson.media_kind, message);
      const patch: Record<string, unknown> = { media_thumb_file_id: thumb ?? "" };
      if (lesson.media_duration === null && duration !== null) patch.media_duration = duration;
      const { error: upErr } = await admin.from("lessons").update(patch).eq("id", lesson.id);
      if (upErr) throw upErr;
      if (thumb) updated++;
      else without++;

      await sleep(PAUSE_MS);
    }

    const { count } = await missing().limit(1);
    return json({ updated, without, remaining: count ?? 0 });
  } catch (err) {
    console.error("refresh-thumbnails error:", err);
    return json({ error: "Failed to refresh thumbnails" }, 500);
  }
});
