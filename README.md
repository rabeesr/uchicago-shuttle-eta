# uchicago-shuttle-eta

Transparent ETAs for UChicago campus shuttles. Replaces the opaque native ETA in the PassioGo-powered official app with a polyline-projection + rolling-speed computation, and shows both numbers side-by-side.

**MPCS 51238 · Design, Build, Ship · Assignment 4**

## Live URLs

- Web (Vercel): _set after deploy_
- Worker health (Railway): _set after deploy_
- Repo: https://github.com/rabeesr/uchicago-shuttle-eta

## Local development

```bash
pnpm install
cp .env.example .env.local
# fill in Supabase URL + keys
pnpm --filter @uchicago-shuttle/worker dev   # worker (WS + ingest + ETA compute)
pnpm --filter @uchicago-shuttle/web dev      # Next.js frontend on :3000
```

See `CLAUDE.md` for full architecture.

## Repo layout

```
apps/
  web/      Next.js 15 app-router frontend (Vercel)
  worker/   Node 22 + TypeScript background worker (Railway)
packages/
  shared/   types shared across web and worker
supabase/
  migrations/   Postgres schema (applied via Supabase MCP)
```
