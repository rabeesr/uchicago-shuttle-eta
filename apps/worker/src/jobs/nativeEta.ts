import { db } from "../db.js";
import { log } from "../log.js";
import { getNativeEta } from "../passio/rest.js";

// Polls Passio's own ETA endpoint and stamps passio_eta_seconds onto the
// stop_etas rows we've already written with our own ETA. Runs every 30s.
// Scoped to (route, stop) pairs that are currently favorited by at least one
// user — so the load scales with usage, not catalog size.
const INTERVAL_MS = 30_000;
const NO_BUS_SECONDS = 86_400;

async function getFavoritedRouteStops(): Promise<Array<{ route_id: string; stop_id: string }>> {
  // Join through stop_etas to find (route, stop) pairs that exist in the live
  // data for stops that at least one user has favorited.
  const { data, error } = await db
    .from("user_favorite_stops")
    .select("stop_id, stop_etas!inner(route_id)");
  if (error) {
    // Fallback when the inner-join syntax fails: just pull favorited stop_ids
    // and match them against stop_etas in a second query.
    const { data: favs } = await db.from("user_favorite_stops").select("stop_id");
    const stopIds = [...new Set((favs ?? []).map((r) => r.stop_id))];
    if (stopIds.length === 0) return [];
    const { data: etaRows } = await db
      .from("stop_etas")
      .select("route_id, stop_id")
      .in("stop_id", stopIds);
    return etaRows ?? [];
  }
  const pairs = new Set<string>();
  const out: Array<{ route_id: string; stop_id: string }> = [];
  // Supabase nested select returns { stop_id, stop_etas: [{route_id}, ...] }
  for (const row of data as Array<{ stop_id: string; stop_etas: { route_id: string }[] }>) {
    for (const et of row.stop_etas) {
      const key = `${et.route_id}:${row.stop_id}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      out.push({ route_id: et.route_id, stop_id: row.stop_id });
    }
  }
  return out;
}

async function tick(): Promise<void> {
  try {
    const pairs = await getFavoritedRouteStops();
    if (pairs.length === 0) {
      log.info("nativeEta: no favorited stops, skipping");
      return;
    }

    // Group stop IDs by route.
    const byRoute = new Map<string, Set<string>>();
    for (const p of pairs) {
      if (!byRoute.has(p.route_id)) byRoute.set(p.route_id, new Set());
      byRoute.get(p.route_id)!.add(p.stop_id);
    }

    const nowIso = new Date().toISOString();
    const updates: Array<{
      route_id: string;
      stop_id: string;
      passio_eta_seconds: number | null;
    }> = [];

    for (const [routeId, stops] of byRoute) {
      try {
        const resp = await getNativeEta(routeId, [...stops]);
        for (const [stopId, entries] of Object.entries(resp.ETAs ?? {})) {
          if (!entries || entries.length === 0) continue;
          // Pick the soonest non-out-of-service entry on this route.
          const relevant = entries
            .filter((e) => e.routeId === routeId && !e.outOfService && e.secondsSpent !== NO_BUS_SECONDS)
            .sort((a, b) => a.secondsSpent - b.secondsSpent);
          const best = relevant[0];
          updates.push({
            route_id: routeId,
            stop_id: stopId,
            passio_eta_seconds: best ? best.secondsSpent : null,
          });
        }
      } catch (err) {
        log.warn("nativeEta: route failed", { routeId, err: String(err) });
      }
    }

    if (updates.length === 0) return;

    // Update the most recent stop_etas row for each (route, stop). We don't
    // know which vehicle_id Passio's ETA corresponds to, so we stamp it onto
    // whichever vehicle is currently closest (lowest our_eta_seconds).
    for (const u of updates) {
      const { data: rows } = await db
        .from("stop_etas")
        .select("vehicle_id, our_eta_seconds")
        .eq("route_id", u.route_id)
        .eq("stop_id", u.stop_id)
        .order("our_eta_seconds", { ascending: true, nullsFirst: false })
        .limit(1);
      const target = rows?.[0];
      if (!target) continue;
      await db
        .from("stop_etas")
        .update({ passio_eta_seconds: u.passio_eta_seconds, computed_at: nowIso })
        .eq("route_id", u.route_id)
        .eq("stop_id", u.stop_id)
        .eq("vehicle_id", target.vehicle_id);
    }

    log.info("nativeEta tick", { updated: updates.length });
  } catch (err) {
    log.error("nativeEta tick failed", { err: String(err) });
  }
}

export function scheduleNativeEta(): void {
  // Delay 10s after boot so dailySync + liveIngest have seeded stop_etas.
  setTimeout(() => {
    void tick();
    setInterval(tick, INTERVAL_MS).unref();
  }, 10_000).unref();
}
