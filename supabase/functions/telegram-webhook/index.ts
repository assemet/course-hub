// Receives bot updates and stores messages a creator sends/forwards to the bot
// as pending imports. Only users in creator mode can import; everyone else gets
// a short explanation in the chat.
//
// Replies are sent by returning a Bot API method in the webhook response body,
// so this function never needs the bot token.
//
// Security: Telegram must be configured with a secret token
//   setWebhook?url=...&secret_token=<TELEGRAM_WEBHOOK_SECRET>
// and every request is rejected unless it carries the same value in the
// X-Telegram-Bot-Api-Secret-Token header. The function uses the service role
// key, so it must never be callable anonymously.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json } from "../_shared/telegram.ts";

type MediaType = "video" | "pdf" | "text" | "link" | "image" | "file" | "audio";
type FileKind = "photo" | "video" | "video_note" | "animation" | "document" | "audio" | "voice";

/** The Telegram file behind a post. `kind` decides which Bot API method can resend it. */
interface TgFileRef {
  kind: FileKind;
  fileId: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

interface Detected {
  mediaType: MediaType;
  mediaUrl: string | null;
  file: TgFileRef | null;
}

// The subset of the Telegram objects this function reads.
interface TgFile {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TgMessage {
  message_id?: number;
  text?: string;
  caption?: string;
  chat?: { id?: number; type?: string };
  from?: { id?: number; language_code?: string };
  video?: TgFile;
  video_note?: TgFile;
  animation?: TgFile;
  document?: TgFile;
  audio?: TgFile & { title?: string };
  voice?: TgFile;
  photo?: TgFile[];
  forward_origin?: {
    type?: string;
    message_id?: number;
    chat?: { username?: string };
  };
}

function firstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

function fileRef(kind: FileKind, f: TgFile | undefined, fallbackMime: string | null = null): TgFileRef | null {
  if (!f?.file_id) return null;
  return {
    kind,
    fileId: f.file_id,
    fileName: f.file_name ?? null,
    mimeType: f.mime_type ?? fallbackMime,
    fileSize: typeof f.file_size === "number" ? f.file_size : null,
  };
}

/** The attachment of a message and the media type it should be shown as. */
function detectAttachment(message: TgMessage): { mediaType: MediaType; file: TgFileRef } | null {
  const attach = (mediaType: MediaType, file: TgFileRef | null) => (file ? { mediaType, file } : null);

  if (message.photo?.length) {
    // Telegram sends several sizes, smallest first; keep the largest.
    return attach("image", fileRef("photo", message.photo[message.photo.length - 1], "image/jpeg"));
  }
  if (message.video) return attach("video", fileRef("video", message.video));
  if (message.video_note) return attach("video", fileRef("video_note", message.video_note, "video/mp4"));
  if (message.animation) return attach("video", fileRef("animation", message.animation));
  if (message.audio) {
    const ref = fileRef("audio", message.audio);
    if (ref && !ref.fileName && message.audio.title) ref.fileName = message.audio.title;
    return attach("audio", ref);
  }
  if (message.voice) return attach("audio", fileRef("voice", message.voice, "audio/ogg"));
  if (message.document) {
    const mime = message.document.mime_type ?? "";
    const mediaType: MediaType =
      mime === "application/pdf" || /\.pdf$/i.test(message.document.file_name ?? "") ? "pdf"
      : mime.startsWith("image/") ? "image"
      : mime.startsWith("video/") ? "video"
      : mime.startsWith("audio/") ? "audio"
      : "file";
    return attach(mediaType, fileRef("document", message.document));
  }
  return null;
}

function detectMediaType(message: TgMessage, text: string): Detected {
  // Native attachments take priority over links in the caption.
  const attachment = detectAttachment(message);
  if (attachment) {
    return { mediaType: attachment.mediaType, mediaUrl: channelPostUrl(message), file: attachment.file };
  }

  const lower = text.toLowerCase();
  if (/(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(lower)) {
    const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/);
    return { mediaType: "video", mediaUrl: match ? match[0] : null, file: null };
  }
  if (/https?:\/\/[^\s]+\.pdf(\?[^\s]*)?/i.test(text)) {
    return { mediaType: "pdf", mediaUrl: text.match(/https?:\/\/[^\s]+\.pdf[^\s]*/i)![0], file: null };
  }
  const url = firstUrl(text);
  if (url) return { mediaType: "link", mediaUrl: url, file: null };

  return { mediaType: "text", mediaUrl: channelPostUrl(message), file: null };
}

/** Public t.me link to the original post, when forwarded from a public channel. */
function channelPostUrl(message: TgMessage): string | null {
  const origin = message.forward_origin;
  if (origin?.type === "channel" && origin.chat?.username && origin.message_id) {
    return `https://t.me/${origin.chat.username}/${origin.message_id}`;
  }
  return null;
}

type Lang = "ar" | "en";

/** Same rule as the Mini App: Arabic unless Telegram says the user uses another language. */
function pickLang(languageCode: string | undefined): Lang {
  const code = languageCode?.toLowerCase();
  return code && !code.startsWith("ar") ? "en" : "ar";
}

const replies = {
  notRegistered: {
    ar: "افتح التطبيق المصغّر مرة واحدة على الأقل لتسجيل حسابك، ثم أعد توجيه الرسالة.",
    en: "Open the Mini App at least once to register, then forward the message again.",
  },
  notCreator: {
    ar: "استيراد الرسائل متاح لصنّاع المحتوى فقط. فعّل وضع صانع المحتوى من صفحة «حسابي» في التطبيق، ثم أعد توجيه الرسالة.",
    en: "Importing is available to creators only. Switch to Creator mode from the Profile tab in the app, then forward the message again.",
  },
  imported: {
    ar: (title: string) => `✅ أُضيفت إلى صندوق الاستيراد: «${title}»\nافتح التطبيق لتحويلها إلى درس.`,
    en: (title: string) => `✅ Added to your Import Inbox: "${title}"\nOpen the app to turn it into a lesson.`,
  },
};

/**
 * Answers the update with a Bot API call embedded in the webhook response.
 * No parse_mode: the text can contain user-controlled content.
 */
function reply(chatId: number, text: string): Response {
  return json({ method: "sendMessage", chat_id: chatId, text });
}

const fallbackTitles: Record<Lang, Record<MediaType, string>> = {
  ar: { video: "فيديو", pdf: "ملف PDF", image: "صورة", file: "ملف", audio: "تسجيل صوتي", link: "رابط", text: "بدون عنوان" },
  en: { video: "Video", pdf: "PDF file", image: "Image", file: "File", audio: "Audio", link: "Link", text: "Untitled" },
};

/** File name without its extension, e.g. "Lesson 3.pdf" -> "Lesson 3". */
function baseName(fileName: string | null): string | null {
  const name = fileName?.replace(/\.[^.\s]{1,5}$/, "").trim();
  return name ? name : null;
}

function extractTitle(text: string, fallback: string): string {
  const firstLine = text.trim().split("\n").find((l) => l.trim());
  if (!firstLine) return fallback;
  const line = firstLine.trim();
  return line.length <= 100 ? line : line.substring(0, 100) + "...";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expectedSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("telegram-webhook: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    const message = body?.message as TgMessage | undefined;
    if (!message) return json({ ok: true, note: "No message in body" });

    // Only accept direct messages to the bot.
    if (message.chat?.type !== "private") return json({ ok: true, note: "Ignored non-private chat" });

    const fromUser = message.from;
    if (!fromUser?.id) return json({ ok: true, note: "No from user" });
    const chatId = message.chat?.id;
    if (typeof chatId !== "number") return json({ ok: true, note: "No chat id" });
    const lang = pickLang(fromUser.language_code);

    // Ignore bot commands such as /start.
    const text = message.text || message.caption || "";
    if (text.startsWith("/")) return json({ ok: true, note: "Command ignored" });

    const telegramMessageId = message.message_id;
    if (typeof telegramMessageId !== "number") return json({ ok: true, note: "No message id" });

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: dbUser } = await supabase
      .from("users")
      .select("id, role")
      .eq("telegram_id", fromUser.id)
      .maybeSingle();
    if (!dbUser) return reply(chatId, replies.notRegistered[lang]);
    if (dbUser.role !== "creator") return reply(chatId, replies.notCreator[lang]);

    const { mediaType, mediaUrl, file } = detectMediaType(message, text);
    const parsedTitle = extractTitle(text, baseName(file?.fileName ?? null) ?? fallbackTitles[lang][mediaType]);

    const { error: insertErr } = await supabase.from("imported_messages").upsert(
      {
        creator_id: dbUser.id,
        telegram_message_id: telegramMessageId,
        raw_content: text || null,
        parsed_title: parsedTitle,
        media_type: mediaType,
        media_url: mediaUrl,
        file_id: file?.fileId ?? null,
        file_kind: file?.kind ?? null,
        file_name: file?.fileName ?? null,
        file_mime_type: file?.mimeType ?? null,
        file_size: file?.fileSize ?? null,
        status: "pending",
      },
      { onConflict: "creator_id,telegram_message_id", ignoreDuplicates: true },
    );
    if (insertErr) throw insertErr;

    return reply(chatId, replies.imported[lang](parsedTitle));
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return json({ error: "Failed to import message" }, 500);
  }
});
