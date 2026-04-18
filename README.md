# uchicago-shuttle-eta

Transparent ETAs for UChicago campus shuttles. Replaces the opaque native ETA in the PassioGo-powered official app with a polyline-projection + rolling-speed computation, and shows both numbers side-by-side.

**MPCS 51238 · Design, Build, Ship · Assignment 4**

## Live URLs

- Web (Vercel): _set after deploy_
- Worker health (Railway): _set after deploy_
- Repo: https://github.com/rabeesr/uchicago-shuttle-eta

## What it does

The worker polls PassioGo's live bus-position endpoint every 5 seconds (UChicago is system `1068`), projects each bus onto its route polyline to get along-route arc distance, maintains a per-bus EWMA of along-route speed, and computes an ETA to each upcoming stop. Passio's own ETA is also polled for stops at least one user has favorited, and both numbers land in the same `stop_etas` row so the UI can show the disagreement.

The frontend is a Next.js app on Vercel. Users sign in via Supabase Auth (magic link), favorite stops from a browsable list, and see live countdowns on the home page that tick down every second via Supabase Realtime — no refresh. A secondary map tab shows bus markers moving in real time.

Full architecture lives in [`CLAUDE.md`](./CLAUDE.md).

## Local development

```bash
pnpm install
cp .env.example .env.local
# fill in Supabase URL + keys

# start both
pnpm dev

# or one at a time
pnpm --filter @uchicago-shuttle/worker dev   # worker
pnpm --filter @uchicago-shuttle/web dev      # web on :3000
```

Run worker unit tests:

```bash
pnpm --filter @uchicago-shuttle/worker test
```

## Repo layout

```
apps/
  web/              Next.js 15 app-router frontend (Vercel)
  worker/           Node 22 + TypeScript background worker (Railway)
packages/
  shared/           shared types across web and worker
supabase/
  migrations/       Postgres schema (applied via Supabase MCP)
railway.json        Railway build config pointing at apps/worker/Dockerfile
.env.example        env var names + placeholders
```

## Deploy

### 1. Supabase

- Create a new project.
- Enable Realtime on the `public` schema (default).
- Apply `supabase/migrations/0001_init.sql` via the Supabase MCP server, the SQL editor, or the Supabase CLI (`supabase db push`).
- Copy the project URL, anon key, and service role key into your `.env.local` and into the Railway / Vercel dashboards below.

### 2. Railway (worker)

- Connect the GitHub repo.
- Railway picks up `railway.json` at the repo root, which builds `apps/worker/Dockerfile`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PASSIO_SYSTEM_ID=1068`, `USER_AGENT`, `WORKER_HEALTH_PORT=8080`.
- Healthcheck path is `/healthz` — already configured.

### 3. Vercel (web)

- Connect the GitHub repo.
- **Set Root Directory to `apps/web`**.
- Framework preset: Next.js (auto-detected).
- Install command: `cd ../.. && pnpm install --frozen-lockfile`.
- Build command: `cd ../.. && pnpm --filter @uchicago-shuttle/web... build`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Verification

End-to-end sanity check after deploy:

1. Railway logs show `worker bootstrapping` and `dailySync: complete` within ~30s of first boot.
2. Supabase dashboard → Table editor → `vehicles` is updating every 5s with fresh timestamps.
3. `stop_etas` has rows keyed by (route, stop, vehicle).
4. On the live Vercel URL, signing up, favoriting a stop, and watching the countdown tick down *without* refreshing validates Auth + RLS + Realtime together.
5. Open DevTools → Network → WS to confirm the Supabase Realtime WebSocket is receiving `postgres_changes` events.
