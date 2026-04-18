# uchicago-shuttle-eta

Transparent ETAs for UChicago campus shuttles. Replaces the opaque native ETA in the PassioGo-powered official app with a polyline-projection + rolling-speed computation, and shows both numbers side-by-side.

**MPCS 51238 · Design, Build, Ship · Assignment 4**

## Live URLs

- Web (Vercel): _set after deploy_
- Worker health (Railway): _set after deploy_
- Repo: https://github.com/rabeesr/uchicago-shuttle-eta

## What it does

The worker polls PassioGo's live bus-position endpoint every 5 seconds (UChicago is system `1068`), projects each bus onto its route polyline to get along-route arc distance, maintains a per-bus EWMA of along-route speed, and computes an ETA to each upcoming stop. Passio's own ETA is also polled for stops at least one user has favorited, and both numbers land in the same `stop_etas` row so the UI can show the disagreement.

The frontend is a Next.js app on Vercel. Users sign in via **Clerk** (native Supabase third-party auth integration — Clerk-issued session JWTs are attached to every Supabase request and Supabase validates them against Clerk's JWKS), favorite both **stops** and **routes**, filter the browse + map views by route, and see live countdowns that tick down every second via Supabase Realtime — no refresh.

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

### 1. Clerk + Supabase native integration

- **Clerk dashboard** → Configure → Integrations → enable the **Supabase** integration. Copy the Publishable Key, Secret Key, and Frontend API URL.
- **Supabase dashboard** → Authentication → Sign In / Up → Third-Party Auth → add **Clerk** and paste the Clerk Frontend API URL.

### 2. Supabase schema

- Create the Supabase project.
- Apply migrations in order via the Supabase MCP server, the SQL editor, or the Supabase CLI:
  - `supabase/migrations/0001_init.sql`
  - `supabase/migrations/0002_clerk_and_favorite_routes.sql`
- Realtime is enabled on `vehicles`, `stop_etas`, `alerts`.
- Copy the project URL, publishable/anon key, and service role key into `.env.local`.

### 3. Railway (worker)

- Connect the GitHub repo.
- Railway picks up `railway.json` at the repo root, which builds `apps/worker/Dockerfile`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PASSIO_SYSTEM_ID=1068`, `USER_AGENT`, `WORKER_HEALTH_PORT=8080`.
- Healthcheck path is `/healthz` — already configured.

### 4. Vercel (web)

- Connect the GitHub repo.
- **Set Root Directory to `apps/web`**.
- Framework preset: Next.js (auto-detected).
- Install command: `cd ../.. && pnpm install --frozen-lockfile`.
- Build command: `cd ../.. && pnpm --filter @uchicago-shuttle/web... build`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.

## Verification

End-to-end sanity check after deploy:

1. Railway logs show `worker bootstrapping` and `dailySync: complete` within ~30s of first boot.
2. Supabase dashboard → Table editor → `vehicles` is updating every 5s with fresh timestamps.
3. `stop_etas` has rows keyed by (route, stop, vehicle).
4. On the live Vercel URL, signing up, favoriting a stop, and watching the countdown tick down *without* refreshing validates Auth + RLS + Realtime together.
5. Open DevTools → Network → WS to confirm the Supabase Realtime WebSocket is receiving `postgres_changes` events.
