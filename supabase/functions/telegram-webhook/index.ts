import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function detectMediaType(text: string): { mediaType: string; mediaUrl: string | null } {
  const lower = text.toLowerCase();

  if (lower.includes("youtube.com/watch") || lower.includes("youtu.be/") || lower.includes("youtube.com/shorts")) {
    const match = text.match(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+)/);
    return { mediaType: "video", mediaUrl: match ? match[1] : null };
  }

  if (lower.includes("t.me/") || lower.includes("telegram.org/")) {
    return { mediaType: "link", mediaUrl: null };
  }

  if (lower.includes(".pdf")) {
    const match = text.match(/(https?:\/\/[^\s]+\.pdf[^\s]*)/);
    return { mediaType: "pdf", mediaUrl: match ? match[1] : null };
  }

  if (lower.match(/https?:\/\//)) {
    const match = text.match(/(https?:\/\/[^\s]+)/);
    return { mediaType: "link", mediaUrl: match ? match[1] : null };
  }

  return { mediaType: "text", mediaUrl: null };
}

function extractTitle(text: string): string {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "Untitled";
  const firstLine = lines[0].trim();
  if (firstLine.length <= 100) return firstLine;
  return firstLine.substring(0, 100) + "...";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const message = body?.message;

    if (!message) {
      return new Response(
        JSON.stringify({ ok: true, note: "No message in body" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const forwardOrigin = message.forward_origin || message.forward_from;
    const isForwarded = !!forwardOrigin || !!message.forward_from_chat;
    const text = message.text || message.caption || "";
    const fromUser = message.from;

    if (!fromUser) {
      return new Response(
        JSON.stringify({ ok: true, note: "No from user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const telegramUserId = fromUser.id;
    const telegramMessageId = message.message_id ?? message.id ?? Date.now();

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: dbUser } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramUserId)
      .maybeSingle();

    if (!dbUser) {
      return new Response(
        JSON.stringify({ ok: true, note: "User not found — open the Mini App first to register" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { mediaType, mediaUrl } = detectMediaType(text);
    const parsedTitle = extractTitle(text);

    const { error: insertErr } = await supabase
      .from("imported_messages")
      .upsert(
        {
          creator_id: dbUser.id,
          telegram_message_id: telegramMessageId,
          raw_content: text || null,
          parsed_title: parsedTitle,
          media_type: mediaType,
          media_url: mediaUrl,
          status: "pending",
        },
        { onConflict: "creator_id,telegram_message_id" }
      );

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        ok: true,
        note: isForwarded
          ? "Forwarded message imported successfully"
          : "Message imported successfully",
        parsed_title: parsedTitle,
        media_type: mediaType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
