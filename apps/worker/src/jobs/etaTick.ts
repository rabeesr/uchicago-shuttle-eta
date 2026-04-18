import { db } from "../db.js";
import { log } from "../log.js";

// In-memory cache of stops-per-route, keyed by route_id. Each entry is stops
// ordered by arc_distance_m ASC. Refreshed on demand (after dailySync completes)
// and on first use.
interface RouteStopEntry {
  stop_id: string;
  stop_order: number;
  arc_distance_m: number;
}

const routeStopCache = new Map<string, RouteStopEntry[]>();

async function loadRouteStops(): Promise<void> {
  const { data, error } = await db
    .from("route_stops")
    .select("route_id, stop_id, stop_order, arc_distance_m")
    .order("route_id")
    .order("arc_distance_m");
  if (error) throw new Error(`load route_stops: ${error.message}`);
  routeStopCache.clear();
  for (const row of data ?? []) {
    const list = routeStopCache.get(row.route_id) ?? [];
    list.push({
      stop_id: row.stop_id,
      stop_order: row.stop_order,
      arc_distance_m: row.arc_distance_m,
    });
    routeStopCache.set(row.route_id, list);
  }
  for (const list of routeStopCache.values()) {
    list.sort((a, b) => a.arc_distance_m - b.arc_distance_m);
  }
}

async function ensureLoaded() {
  if (routeStopCache.size === 0) await loadRouteStops();
}

/** Minimum rolling speed to emit an ETA — otherwise we'd divide by ~0. */
const MIN_SPEED_FOR_ETA = 1.0; // m/s (~2.2 mph)
/** Padding per upcoming stop to account for dwell time. */
const DWELL_PADDING_SEC = 15;
/** We only emit ETAs for the next N upcoming stops per bus, to bound write volume. */
const MAX_UPCOMING_STOPS = 6;

export interface BusSnapshot {
  busId: string;
  routeId: string;
  busArcM: number;
  /** Total length of the bus's route polyline, used for loop-wrap math. */
  routeTotalM: number;
  rollingSpeedMps: number;
  stopped: boolean;
}

export async function emitEtasForBus(snap: BusSnapshot): Promise<void> {
  try {
    await ensureLoaded();
    const stops = routeStopCache.get(snap.routeId);
    if (!stops || stops.length === 0) return;

    const speed = Math.max(snap.rollingSpeedMps, MIN_SPEED_FOR_ETA);

    // Upcoming stops: those ahead on the polyline. If the bus is past every
    // stop, wrap around using the true polyline length (passed in from
    // liveIngest) — using max-stop-arc as the wrap length produces negative
    // distances for routes whose polyline extends past the last stop (common
    // for loop routes that end at a yard past the last passenger stop).
    const ahead = stops.filter((s) => s.arc_distance_m >= snap.busArcM);
    const candidates = ahead.length > 0
      ? ahead.map((s) => ({ stop_id: s.stop_id, distance: s.arc_distance_m - snap.busArcM }))
      : snap.routeTotalM > 0
        ? stops.map((s) => ({
            stop_id: s.stop_id,
            distance: s.arc_distance_m + snap.routeTotalM - snap.busArcM,
          }))
        : [];

    // Safety net: drop any lingering non-positive entries so we never write
    // a negative ETA.
    const upcoming = candidates
      .filter((c) => c.distance >= 0)
      .slice(0, MAX_UPCOMING_STOPS);
    if (upcoming.length === 0) return;

    const nowIso = new Date().toISOString();
    const rows = upcoming.map((c, idx) => {
      const eta = snap.stopped && idx === 0
        ? 0
        : Math.max(0, Math.round(c.distance / speed + idx * DWELL_PADDING_SEC));
      return {
        route_id: snap.routeId,
        stop_id: c.stop_id,
        vehicle_id: snap.busId,
        our_eta_seconds: eta,
        passio_eta_seconds: null as number | null,
        computed_at: nowIso,
      };
    });

    const { error } = await db.from("stop_etas").upsert(rows, {
      onConflict: "route_id,stop_id,vehicle_id",
      ignoreDuplicates: false,
    });
    if (error) log.warn("stop_etas upsert", { err: error.message });
  } catch (err) {
    log.warn("emitEtasForBus failed", { err: String(err) });
  }
}

/** Force a cache reload — called after dailySync finishes. */
export async function reloadRouteStops(): Promise<void> {
  await loadRouteStops();
}
