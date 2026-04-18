import { db } from "../db.js";
import { log } from "../log.js";
import { getVehicles, type RawBus } from "../passio/rest.js";
import {
  cumulativeArcM,
  pickBestSegment,
  type LatLon,
  type ResolvedPolyline,
} from "../eta/project.js";
import { updateSpeed } from "../eta/state.js";
import { emitEtasForBus } from "./etaTick.js";

// In-memory cache of route polylines to avoid hitting Supabase per tick.
// Loaded lazily on first use and refreshed when a bus shows up on an
// unknown route (which happens after a daily sync but before the worker
// restarts).
const polyCache = new Map<string, ResolvedPolyline[]>();

async function loadPolylines(): Promise<void> {
  const { data, error } = await db
    .from("routes")
    .select("id, polyline, polyline_cumulative_m");
  if (error) throw new Error(`load routes: ${error.message}`);
  polyCache.clear();
  for (const r of data ?? []) {
    const poly = (r.polyline as LatLon[] | null) ?? [];
    if (poly.length < 2) {
      polyCache.set(r.id, []);
      continue;
    }
    const cum =
      (r.polyline_cumulative_m as number[] | null) ??
      cumulativeArcM(poly);
    polyCache.set(r.id, [{ polyline: poly, cumulative: cum }]);
  }
}

async function ensurePolylinesLoaded(): Promise<void> {
  if (polyCache.size === 0) await loadPolylines();
}

const POLL_INTERVAL_MS = 5_000;

async function tick(): Promise<void> {
  try {
    await ensurePolylinesLoaded();
    const resp = await getVehicles();
    const now = Date.now();

    const rows: Array<{
      id: string;
      route_id: string | null;
      lat: number;
      lon: number;
      heading: number | null;
      speed_mps: number | null;
      pax_load: number | null;
      out_of_service: boolean;
      arc_distance_m: number | null;
      rolling_speed_mps: number | null;
      updated_at: string;
    }> = [];

    const etaTasks: Array<Promise<void>> = [];

    for (const bucket of Object.values(resp.buses)) {
      for (const b of bucket as RawBus[]) {
        const busId = String(b.busId);
        const routeId = b.routeId ? String(b.routeId) : null;
        const lat = Number(b.latitude);
        const lon = Number(b.longitude);
        const heading = Number(b.calculatedCourse);

        let arcM: number | null = null;
        if (routeId) {
          const segs = polyCache.get(routeId);
          if (segs && segs.length > 0) {
            const best = pickBestSegment([lat, lon], segs);
            if (best && best.projection.perpendicularM < 100) {
              arcM = best.projection.arcM;
            }
          }
        }

        const state = arcM !== null
          ? updateSpeed(busId, routeId, arcM, now)
          : null;

        rows.push({
          id: busId,
          route_id: routeId,
          lat,
          lon,
          heading: Number.isFinite(heading) ? heading : null,
          speed_mps: null, // Passio doesn't report; we derive our own.
          pax_load: b.paxLoad ?? null,
          out_of_service: b.outOfService === 1,
          arc_distance_m: arcM,
          rolling_speed_mps: state?.rollingSpeedMps ?? null,
          updated_at: new Date(now).toISOString(),
        });

        if (routeId && arcM !== null && state && !rows.at(-1)!.out_of_service) {
          etaTasks.push(
            emitEtasForBus({
              busId,
              routeId,
              busArcM: arcM,
              rollingSpeedMps: state.rollingSpeedMps,
              stopped: state.stoppedSince !== null,
            }),
          );
        }
      }
    }

    if (rows.length > 0) {
      const { error } = await db.from("vehicles").upsert(rows, { onConflict: "id" });
      if (error) log.error("vehicles upsert failed", { err: error.message });
    }

    await Promise.all(etaTasks);

    log.info("liveIngest tick", { vehicles: rows.length });
  } catch (err) {
    log.error("liveIngest tick failed", { err: String(err) });
  }
}

export function scheduleLiveIngest(): void {
  // Kick immediately, then every POLL_INTERVAL_MS.
  void tick();
  setInterval(tick, POLL_INTERVAL_MS).unref();
}

/** Force a polyline reload — used after dailySync rewrites them. */
export async function reloadPolylines(): Promise<void> {
  await loadPolylines();
}
