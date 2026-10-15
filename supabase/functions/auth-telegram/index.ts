// Exchanges verified Telegram Mini App initData for a short-lived Supabase JWT.
// The JWT's `sub` is the users.id of the Telegram user, so RLS policies can use
// auth.uid() to scope access to the caller's own data.
//
// Required secrets (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN  - the bot token (never ship it to the browser)
//   APP_JWT_SECRET      - the project's JWT secret (Settings > API > JWT Secret)
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json, signJwt, verifyInitData } from "../_shared/telegram.ts";

const TOKEN_TTL_SECONDS = 60 * 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const jwtSecret = Deno.env.get("APP_JWT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !jwtSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("auth-telegram: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";

    const tgUser = await verifyInitData(initData, botToken);
    if (!tgUser) return json({ error: "Invalid Telegram session" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // `role` is intentionally not part of the payload, so existing users keep
    // theirs and new users get the column default ('student').
    const { data: user, error } = await supabase
      .from("users")
      .upsert(
        {
          telegram_id: tgUser.id,
          username: tgUser.username ?? null,
          first_name: tgUser.first_name ?? "Student",
          photo_url: tgUser.photo_url ?? null,
        },
        { onConflict: "telegram_id" },
      )
      .select()
      .single();
    if (error || !user) throw error ?? new Error("Could not load user");

    const { token, expiresAt } = await signJwt(
      {
        aud: "authenticated",
        role: "authenticated",
        sub: user.id,
        telegram_id: user.telegram_id,
      },
      jwtSecret,
      TOKEN_TTL_SECONDS,
    );

    return json({ token, expires_at: expiresAt, user });
  } catch (err) {
    console.error("auth-telegram error:", err);
    return json({ error: "Authentication failed" }, 500);
  }
});
