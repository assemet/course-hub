// Sends a student's certificate image to their own Telegram chat, with a
// button that opens the verification screen.
//
// The image is drawn in the Mini App (browsers render Arabic text well). It is
// only a picture: what makes a certificate genuine is its code, which anyone
// can check with verify_certificate(). The caller is identified by Telegram
// initData and must own the certificate; the text comes from the database.
//
// multipart/form-data: init_data, certificate_id, image (PNG or JPEG, <= 5 MB)
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, getBotUsername, json, verifyInitData } from "../_shared/telegram.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isPngOrJpeg(bytes: Uint8Array): boolean {
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg;
}

function caption(lang: "ar" | "en", course: string, code: string): string {
  const pretty = code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
  return lang === "ar"
    ? `🎓 مبروك! شهادة إتمام دورة «${course}»\n\nرمز التحقق: ${pretty}`
    : `🎓 Congratulations! Certificate of completion for "${course}"\n\nVerification code: ${pretty}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    console.error("certificate-send: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const form = await req.formData().catch(() => null);
    const initData = form?.get("init_data");
    const certificateId = form?.get("certificate_id");
    const image = form?.get("image");
    if (typeof initData !== "string" || typeof certificateId !== "string" || !(image instanceof File)) {
      return json({ error: "init_data, certificate_id and image are required" }, 400);
    }
    if (image.size === 0 || image.size > MAX_IMAGE_BYTES) return json({ error: "Invalid image size" }, 400);
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!isPngOrJpeg(bytes)) return json({ error: "Image must be PNG or JPEG" }, 400);

    const tgUser = await verifyInitData(initData, botToken);
    if (!tgUser) return json({ error: "Invalid Telegram session" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: user } = await supabase.from("users").select("id").eq("telegram_id", tgUser.id).maybeSingle();
    if (!user) return json({ error: "User not found" }, 401);

    const { data: cert } = await supabase
      .from("certificates")
      .select("id, code, course_title, user_id")
      .eq("id", certificateId)
      .maybeSingle();
    // Only the certificate's owner can have it sent (to their own chat).
    if (!cert || cert.user_id !== user.id) return json({ error: "not_found" }, 404);

    const lang = tgUser.language_code && !tgUser.language_code.toLowerCase().startsWith("ar") ? "en" : "ar";
    const username = await getBotUsername(botToken);
    const out = new FormData();
    out.append("chat_id", String(tgUser.id));
    out.append("photo", new Blob([bytes], { type: image.type || "image/png" }), "certificate.png");
    // No parse_mode: the course title is user-controlled text.
    out.append("caption", caption(lang, String(cert.course_title).slice(0, 300), cert.code));
    if (username) {
      out.append("reply_markup", JSON.stringify({
        inline_keyboard: [[{
          text: lang === "ar" ? "✅ التحقق من الشهادة" : "✅ Verify certificate",
          url: `https://t.me/${username}/app?startapp=cert_${cert.code}`,
        }]],
      }));
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: out });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) return json({ sent: true });
    if (res.status === 403) return json({ error: "chat_unavailable" }, 409);
    console.error("certificate-send: Telegram error", res.status, data?.description);
    return json({ error: "Telegram API returned an error" }, 502);
  } catch (err) {
    console.error("certificate-send error:", err);
    return json({ error: "Failed to send certificate" }, 500);
  }
});
