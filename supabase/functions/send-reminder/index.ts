const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const telegramId = body?.telegram_id;
    const courseTitle = body?.course_title;
    const botToken = body?.bot_token;

    if (!botToken) {
      return new Response(
        JSON.stringify({ error: "bot_token is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!telegramId || !courseTitle) {
      return new Response(
        JSON.stringify({ error: "telegram_id and course_title are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = `📚 Don't forget about your course "${courseTitle}"!\n\nYou haven't been active in a while. Jump back in and continue where you left off.`;

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramId,
          text,
          parse_mode: "HTML",
        }),
      }
    );

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      return new Response(
        JSON.stringify({
          sent: false,
          error: tgData.description || "Telegram API returned an error",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ sent: true, message_id: tgData.result?.message_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
