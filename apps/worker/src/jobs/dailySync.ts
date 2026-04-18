import { db } from "../db.js";
import { log } from "../log.js";
import {
  getStops,
  type RawStop,
  type RawLatLng,
} from "../passio/rest.js";
import {
  cumulativeArcM,
  projectOntoPolyline,
  type LatLon,
} from "../eta/project.js";

// The getStops endpoint is the canonical source of truth for this system:
// it returns the complete routes catalog, short names, ordered stop lists,
// and polylines in a single call. The separate getRoutes endpoint omits
// polylines and sometimes disagrees on which routes are active, so we ignore
// it here.

function longestPolyline(
  raw: RawLatLng[][] | RawLatLng[] | undefined,
): LatLon[] {
  if (!raw || raw.length === 0) return [];
  const segments: RawLatLng[][] = Array.isArray(raw[0])
    ? (raw as RawLatLng[][])
    : [raw as RawLatLng[]];
  let best: RawLatLng[] = [];
  for (const seg of segments) {
    if (seg.length > best.length) best = seg;
  }
  return best.map((p) => [Number(p.lat), Number(p.lng)] as LatLon);
}

// Build a unique stopId -> stop lookup from the stops payload, which may have
// the same stop repeated once per route it serves.
function indexStopsById(raw: Record<string, RawStop | RawStop[]>): Map<
  string,
  { id: string; name: string; lat: number; lon: number; radius_m: number | null }
> {
  const out = new Map<
    string,
    { id: string; name: string; lat: number; lon: number; radius_m: number | null }
  >();
  for (const entry of Object.values(raw)) {
    const items = Array.isArray(entry) ? entry : [entry];
    for (const s of items) {
      if (out.has(s.stopId)) continue;
      out.set(s.stopId, {
        id: s.stopId,
        name: s.name,
        lat: Number(s.latitude),
        lon: Number(s.longitude),
        radius_m: s.radius ?? null,
      });
    }
  }
  return out;
}

export async function runDailySync() {
  log.info("dailySync: starting");

  const stopsResp = await getStops();

  // Passio's UChicago account (system 1068) includes CTA routes as reference
  // overlays. They have degenerate concatenated polylines that break our
  // arc-projection math, and they're not what this app is for — skip them.
  const routeEntries = Object.entries(stopsResp.routes).filter(
    ([rid]) => !rid.toLowerCase().startsWith("cta"),
  );
  const stopsById = indexStopsById(stopsResp.stops);

  log.info("dailySync: fetched", {
    routes: routeEntries.length,
    stops: stopsById.size,
    routePoints: Object.keys(stopsResp.routePoints).length,
  });

  // Routes: name + color + polyline + cumulative arc.
  const routeRows = routeEntries.map(([rid, entry]) => {
    const [name, color] = entry;
    const shortName = stopsResp.routeShortNames[rid] ?? null;
    const polyline = longestPolyline(stopsResp.routePoints[rid]);
    const cumulative = cumulativeArcM(polyline);
    return {
      id: rid,
      name: name ?? rid,
      short_name: shortName,
      color: color ?? null,
      polyline,
      polyline_cumulative_m: cumulative,
      updated_at: new Date().toISOString(),
    };
  });
  {
    const { error } = await db.from("routes").upsert(routeRows, { onConflict: "id" });
    if (error) throw new Error(`routes upsert: ${error.message}`);
  }

  // Stops (deduped by stopId).
  const stopRows = [...stopsById.values()];
  {
    const { error } = await db.from("stops").upsert(stopRows, { onConflict: "id" });
    if (error) throw new Error(`stops upsert: ${error.message}`);
  }

  // route_stops: iterate each route's ordered stop list, resolve each stop's
  // lat/lon from stopsById, project onto the route polyline for arc_distance_m.
  const routeStopRows: Array<{
    route_id: string;
    stop_id: string;
    stop_order: number;
    arc_distance_m: number;
  }> = [];

  let routesWithoutPolyline = 0;
  let routesSkippedShape = 0;
  let routesErrored = 0;
  for (const [rid, entry] of routeEntries) {
    try {
      if (!Array.isArray(entry) || entry.length < 3) {
        routesSkippedShape++;
        continue;
      }
      const rawStopEntries = entry.slice(2);
      const stopEntries = rawStopEntries.filter(
        (e): e is [string, string, number] =>
          Array.isArray(e) && e.length >= 2 && e[1] != null,
      );
      if (stopEntries.length === 0) continue;

      const polyline = longestPolyline(stopsResp.routePoints[rid]);
      const cum = polyline.length >= 2 ? cumulativeArcM(polyline) : null;

      if (!cum) {
        // Fallback: piecewise-linear between stops themselves.
        routesWithoutPolyline++;
        const resolved = stopEntries
          .map((se) => ({ position: Number(se[0]), stop: stopsById.get(String(se[1])) }))
          .filter((x) => x.stop)
          .sort((a, b) => a.position - b.position);
        if (resolved.length < 2) continue;
        const poly: LatLon[] = resolved.map((r) => [r.stop!.lat, r.stop!.lon]);
        const stopCum = cumulativeArcM(poly);
        const seenFallback = new Set<string>();
        resolved.forEach((r, i) => {
          if (seenFallback.has(r.stop!.id)) return;
          seenFallback.add(r.stop!.id);
          routeStopRows.push({
            route_id: rid,
            stop_id: r.stop!.id,
            stop_order: r.position,
            arc_distance_m: stopCum[i],
          });
        });
        continue;
      }

      // Deduplicate stopEntries on stopId (loop routes repeat the first stop at
      // the end); keep the first occurrence to avoid PK conflict.
      const seen = new Set<string>();
      for (const [positionStr, stopId] of stopEntries) {
        const sid = String(stopId);
        if (seen.has(sid)) continue;
        seen.add(sid);
        const stop = stopsById.get(sid);
        if (!stop) continue;
        const p = projectOntoPolyline([stop.lat, stop.lon], polyline, cum);
        routeStopRows.push({
          route_id: rid,
          stop_id: sid,
          stop_order: Number(positionStr),
          arc_distance_m: p.arcM,
        });
      }
    } catch (err) {
      routesErrored++;
      log.warn("dailySync: route failed", { rid, err: String(err) });
    }
  }
  {
    const { error } = await db.from("route_stops").upsert(routeStopRows, {
      onConflict: "route_id,stop_id",
    });
    if (error) throw new Error(`route_stops upsert: ${error.message}`);
  }

  log.info("dailySync: complete", {
    routes: routeRows.length,
    stops: stopRows.length,
    routeStops: routeStopRows.length,
    routesWithoutPolyline,
    routesSkippedShape,
    routesErrored,
  });

  // Refresh liveIngest + etaTick caches so new data becomes visible in-process.
  const { reloadPolylines } = await import("./liveIngest.js");
  const { reloadRouteStops } = await import("./etaTick.js");
  await Promise.all([reloadPolylines(), reloadRouteStops()]);
}

export function scheduleDailySync() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const tick = async () => {
    try {
      await runDailySync();
    } catch (err) {
      log.error("dailySync failed", { err: String(err) });
    }
  };
  setInterval(tick, DAY_MS).unref();
}
