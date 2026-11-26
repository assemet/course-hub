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

interface Detected {
  mediaType: "video" | "pdf" | "text" | "link" | "image" | "file";
  mediaUrl: string | null;
}

// The subset of the Telegram Message object this function reads.
interface TgMessage {
  message_id?: number;
  text?: string;
  caption?: string;
  chat?: { id?: number; type?: string };
  from?: { id?: number; language_code?: string };
  video?: unknown;
  video_note?: unknown;
  animation?: unknown;
  document?: { mime_type?: string };
  photo?: unknown;
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

function detectMediaType(message: TgMessage, text: string): Detected {
  // Native attachments take priority over links in the caption.
  if (message.video || message.video_note || message.animation) {
    return { mediaType: "video", mediaUrl: channelPostUrl(message) };
  }
  if (message.document) {
    const isPdf = message.document.mime_type === "application/pdf";
    return { mediaType: isPdf ? "pdf" : "file", mediaUrl: channelPostUrl(message) };
  }
  if (message.photo) {
    return { mediaType: "image", mediaUrl: channelPostUrl(message) };
  }

  const lower = text.toLowerCase();
  if (/(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(lower)) {
    const match = text.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/);
    return { mediaType: "video", mediaUrl: match ? match[0] : null };
  }
  if (/https?:\/\/[^\s]+\.pdf(\?[^\s]*)?/i.test(text)) {
    return { mediaType: "pdf", mediaUrl: text.match(/https?:\/\/[^\s]+\.pdf[^\s]*/i)![0] };
  }
  const url = firstUrl(text);
  if (url) return { mediaType: "link", mediaUrl: url };

  return { mediaType: "text", mediaUrl: channelPostUrl(message) };
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

    const { mediaType, mediaUrl } = detectMediaType(message, text);
    const parsedTitle = extractTitle(text, mediaType === "text" ? "Untitled" : `Imported ${mediaType}`);

    const { error: insertErr } = await supabase.from("imported_messages").upsert(
      {
        creator_id: dbUser.id,
        telegram_message_id: telegramMessageId,
        raw_content: text || null,
        parsed_title: parsedTitle,
        media_type: mediaType,
        media_url: mediaUrl,
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
