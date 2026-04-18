import { db } from "../db.js";
import { log } from "../log.js";
import {
  getRoutes,
  getStops,
  type RawStop,
  type RawLatLng,
} from "../passio/rest.js";
import {
  cumulativeArcM,
  projectOntoPolyline,
  type LatLon,
} from "../eta/project.js";

// Normalize Passio's routePoints shape (array of segments, each an array of
// {lat, lng} strings) to a single longest polyline of [lat, lon] numbers.
// We pick the longest segment because Passio sometimes returns duplicates
// (outbound + inbound of the same loop).
function longestPolyline(
  raw: RawLatLng[][] | RawLatLng[] | undefined,
): LatLon[] {
  if (!raw) return [];
  const segments: RawLatLng[][] = Array.isArray(raw[0])
    ? (raw as RawLatLng[][])
    : [raw as RawLatLng[]];
  let best: RawLatLng[] = [];
  for (const seg of segments) {
    if (seg.length > best.length) best = seg;
  }
  return best.map((p) => [Number(p.lat), Number(p.lng)] as LatLon);
}

// Collapse per-stop duplicates (one stop may appear once per route it belongs
// to) and group by route so we can compute stop_order + arc_distance_m.
interface StopsByRoute {
  [routeId: string]: Array<{
    stopId: string;
    name: string;
    lat: number;
    lon: number;
    radius: number | null;
    position: number;
  }>;
}

function groupStopsByRoute(raw: Record<string, RawStop | RawStop[]>): StopsByRoute {
  const out: StopsByRoute = {};
  for (const entry of Object.values(raw)) {
    const items = Array.isArray(entry) ? entry : [entry];
    for (const s of items) {
      const rid = s.routeId;
      if (!out[rid]) out[rid] = [];
      out[rid].push({
        stopId: s.stopId,
        name: s.name,
        lat: Number(s.latitude),
        lon: Number(s.longitude),
        radius: s.radius ?? null,
        position: Number(s.position),
      });
    }
  }
  for (const rid of Object.keys(out)) {
    out[rid].sort((a, b) => a.position - b.position);
  }
  return out;
}

export async function runDailySync() {
  log.info("dailySync: starting");

  const [routesResp, stopsResp] = await Promise.all([getRoutes(), getStops()]);

  const routes = routesResp.all.filter((r) => !r.outdated);
  const stopsByRoute = groupStopsByRoute(stopsResp.stops);

  log.info("dailySync: fetched", {
    routes: routes.length,
    routesWithStops: Object.keys(stopsByRoute).length,
    routePoints: Object.keys(stopsResp.routePoints).length,
  });

  // Upsert routes with polyline + cumulative arc lengths.
  const routeRows = routes.map((r) => {
    const rid = String(r.myid);
    const polyline = longestPolyline(stopsResp.routePoints[rid]);
    const cumulative = cumulativeArcM(polyline);
    return {
      id: rid,
      name: r.name,
      short_name: r.shortName,
      color: r.color,
      polyline,
      polyline_cumulative_m: cumulative,
      updated_at: new Date().toISOString(),
    };
  });
  {
    const { error } = await db.from("routes").upsert(routeRows, { onConflict: "id" });
    if (error) throw new Error(`routes upsert: ${error.message}`);
  }

  // Stops: deduplicate by stopId (first occurrence wins).
  const stopMap = new Map<
    string,
    { id: string; name: string; lat: number; lon: number; radius_m: number | null }
  >();
  for (const stops of Object.values(stopsByRoute)) {
    for (const s of stops) {
      if (!stopMap.has(s.stopId)) {
        stopMap.set(s.stopId, {
          id: s.stopId,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          radius_m: s.radius,
        });
      }
    }
  }
  const stopRows = [...stopMap.values()];
  {
    const { error } = await db.from("stops").upsert(stopRows, { onConflict: "id" });
    if (error) throw new Error(`stops upsert: ${error.message}`);
  }

  // route_stops: for each route × its stops, project each stop onto the
  // polyline to get arc_distance_m. Stop_order comes from Passio's `position`.
  const routeStopRows: Array<{
    route_id: string;
    stop_id: string;
    stop_order: number;
    arc_distance_m: number;
  }> = [];
  let skippedNoPolyline = 0;
  for (const route of routes) {
    const rid = String(route.myid);
    const polyline = longestPolyline(stopsResp.routePoints[rid]);
    const stops = stopsByRoute[rid] ?? [];
    if (polyline.length < 2) {
      // Fallback: stops themselves form the "polyline" (piecewise-linear
      // between stops). arc_distance_m becomes cumulative stop-to-stop Haversine.
      if (stops.length === 0) continue;
      const stopPolyline: LatLon[] = stops.map((s) => [s.lat, s.lon]);
      const cum = cumulativeArcM(stopPolyline);
      stops.forEach((s, i) => {
        routeStopRows.push({
          route_id: rid,
          stop_id: s.stopId,
          stop_order: s.position,
          arc_distance_m: cum[i],
        });
      });
      skippedNoPolyline++;
      continue;
    }
    const cum = cumulativeArcM(polyline);
    for (const s of stops) {
      const p = projectOntoPolyline([s.lat, s.lon], polyline, cum);
      routeStopRows.push({
        route_id: rid,
        stop_id: s.stopId,
        stop_order: s.position,
        arc_distance_m: p.arcM,
      });
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
    routesWithoutPolyline: skippedNoPolyline,
  });
}

// Runs once on startup, then every 24h. Railway will also restart daily
// due to Nixpacks' default container recycle, so the 24h loop is belt +
// suspenders.
export function scheduleDailySync() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const tick = async () => {
    try {
      await runDailySync();
    } catch (err) {
      log.error("dailySync failed", { err: String(err) });
    }
  };
  void tick();
  setInterval(tick, DAY_MS).unref();
}
