# course-hub

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-txdfxcsl)

Telegram Mini App for creating and following courses (React + Vite + Supabase).

## Local setup

```bash
cp .env.example .env      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev
npm run typecheck && npm run lint && npm run build
```

The app only works inside Telegram (it needs signed `initData`).

## How authentication works

1. The Mini App sends Telegram's signed `initData` to the `auth-telegram` Edge Function.
2. The function verifies the HMAC with the bot token, upserts the user, and returns a
   1-hour Supabase JWT whose `sub` is `users.id`.
3. The client uses that JWT for every query, and Row Level Security scopes data with
   `auth.uid()` (see `supabase/migrations/*_004_lock_down_rls.sql`).

The anon key alone has **no** access to any table.

## Deploying the backend

Secrets (the CLI refuses names starting with `SUPABASE_`, hence `APP_JWT_SECRET`):

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN=<bot token from @BotFather> \
  APP_JWT_SECRET=<Project Settings > API > JWT Secret> \
  TELEGRAM_WEBHOOK_SECRET=<long random string>
```

Deploy in this order so the live app is never left without access:

```bash
supabase functions deploy auth-telegram
supabase functions deploy send-reminder
supabase functions deploy telegram-webhook
# deploy the new frontend, THEN:
supabase db push          # applies the RLS lockdown migration
```

Point the bot webhook at the function with the secret token:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<project>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

> If the bot token was ever deployed in a build that included `VITE_TELEGRAM_BOT_TOKEN`,
> treat it as leaked: revoke it in @BotFather (`/revoke`) and set the new one as a secret.

## Notes

- `course_tracker_full_schema.sql` is an old all-in-one script with demo data and
  permissive policies. Use the files in `supabase/migrations/` instead.
