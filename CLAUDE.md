# UChicago Shuttle ETA — Architecture

## Problem

UChicago's campus shuttles use PassioGo, which exposes raw GPS live, but its native ETA predictions are widely-complained-about (imprecise, laggy, sometimes way off). This project replaces that prediction layer with a transparent one and displays both numbers side-by-side so users can see when we disagree with Passio.

## System

```
PassioGo (system 1068)
  ├─ wss://passio3.com/                    [live positions — primary]
  └─ https://passiogo.com/mapGetData.php   [routes, stops, polylines, ETA — REST]
                    │
                    ▼
Railway Worker (Node 22 + TS, apps/worker/)
  ├─ dailySync   : nightly pull of routes, stops, route_stops with precomputed arc distances
  ├─ liveIngest  : WS subscription → upsert vehicles, trigger etaTick
  ├─ etaTick     : polyline-projection + EWMA-speed → upsert stop_etas
  └─ nativeEta   : every 30s, GET Passio ETA for favorited stops, stamp alongside ours
                    │
                    ▼
Supabase Postgres (+ Realtime)
  routes, stops, route_stops          (reference, upsert nightly)
  vehicles, stop_etas, alerts         (live, Realtime-published)
  user_favorite_stops                 (per-user, RLS: own rows only)
                    │
                    ▼
Vercel (Next.js 15 app-router, apps/web/)
  /        stop-centric dashboard — countdowns for favorite stops
  /stops   browse all stops, favorite toggle
  /map     live map (Leaflet + MapLibre tiles) of buses
  /auth    Supabase Auth (magic link)
```

## Data flow (one bus position update)

1. Passio WS pushes a `location` frame: `{ busId, latitude, longitude, course, ... }`.
2. Worker looks up the bus's `routeId` (from last known state or a fresh `getBuses` call on cold start).
3. `project()` maps `(lat, lon)` onto the route polyline → `arc_distance_m`.
4. `updateSpeed()` computes along-route instantaneous speed vs the previous tick, clips to `[0, 20] m/s`, updates EWMA (`α=0.3`). Dwell at stops (≈0 m/s) is skipped.
5. Upsert `vehicles` row with new position + EWMA speed.
6. For each upcoming stop on the route: `our_eta_seconds = (stop_arc - bus_arc) / speed_ewma + dwell_padding * stops_between`. Upsert into `stop_etas`.
7. Supabase Realtime broadcasts the row change; subscribed web clients update the countdown without a page refresh.
8. In parallel, every 30s the worker calls Passio's native ETA endpoint for favorited `(route, stop)` pairs and stamps `passio_eta_seconds` on the same row.

## Why this beats Passio's native ETA

Passio's ETA is a black box. Ours is a transparent algorithm keyed to current along-route speed — errors are dominated by traffic, not modeling guesswork. On a closed campus route (<5 mi, 10–15 mph average), meter-level polyline-projection errors produce single-digit-second ETA errors, which is below what users perceive. We also don't lag: Realtime pushes the update the moment the EWMA changes.

## Tables

| Table | Writer | Realtime |
|---|---|---|
| `routes` | worker (daily) | no |
| `stops` | worker (daily) | no |
| `route_stops` | worker (daily) | no |
| `vehicles` | worker (on each live frame) | yes |
| `stop_etas` | worker (on each live frame) | yes |
| `alerts` | worker (hourly) | yes |
| `user_favorite_stops` | web (auth'd user) | no (client refetches on change) |

## Auth & RLS

- Supabase Auth, email magic link.
- `user_favorite_stops` is the only user-owned table; RLS: `auth.uid() = user_id` on read/write.
- Reference tables and live tables are read-public, service-role-only writes.

## Deployment

- **Vercel** hosts `apps/web/` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Railway** hosts `apps/worker/` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PASSIO_SYSTEM_ID=1068`, `USER_AGENT`. Exposes `/healthz` for Railway's health probe.
- **Supabase** schema lives in `supabase/migrations/`; applied via Supabase MCP.

## Etiquette / external API usage

- Identifying `User-Agent` header with contact email.
- WS runs continuously, REST fallback polls every 10s only when WS is down, minimum 5s floor.
- Native-ETA endpoint called only for stops that have at least one user favoriting them — so load scales with usage, not with catalog size.
- Honor `Retry-After`.
