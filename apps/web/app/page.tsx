import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import Dashboard, { type InitialEta } from "@/components/Dashboard";
import MiniMapLoader from "@/components/MiniMapLoader";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <div className="flex items-center gap-2 text-xs font-medium text-accent">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
            live · 20 routes · 675 stops
          </div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            UChicago shuttles,<br />with transparent ETAs.
          </h1>
          <p className="mt-3 max-w-xl text-gray-600">
            Live bus positions from PassioGo, projected onto route polylines,
            with a rolling-speed ETA — and Passio&apos;s own estimate shown
            right next to it so you can see when we disagree.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/sign-in"
              className="rounded-lg bg-gray-900 px-6 py-2.5 font-medium text-white transition-colors hover:bg-gray-800"
            >
              Sign in
            </Link>
            <Link
              href="/map"
              className="rounded-lg border border-gray-200 bg-white px-6 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Peek at the map
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const supabase = await getSupabaseServer();

  // Favorites (stops + routes), joined with their reference tables.
  const [{ data: favStops }, { data: favRoutes }] = await Promise.all([
    supabase.from("user_favorite_stops").select("stop_id, stops(id, name)"),
    supabase.from("user_favorite_routes").select("route_id, routes(id, name, color)"),
  ]);

  const stopIds = (favStops ?? []).map((f) => f.stop_id);
  const routeIds = (favRoutes ?? []).map((f) => f.route_id);

  if (stopIds.length === 0 && routeIds.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold">Your shuttle</h1>
        <p className="mt-2 text-gray-600">
          Favorite{" "}
          <Link href="/routes" className="font-medium text-accent underline">
            routes
          </Link>{" "}
          or{" "}
          <Link href="/stops" className="font-medium text-accent underline">
            stops
          </Link>{" "}
          to see live countdowns here.
        </p>
      </main>
    );
  }

  // For favorite stops: look up live ETAs for those stop_ids.
  // For favorite routes: look up live ETAs per route (soonest bus on that route).
  const { data: etas } = await supabase
    .from("stop_etas")
    .select(
      "route_id, stop_id, vehicle_id, our_eta_seconds, passio_eta_seconds, computed_at, stops(name), routes(name, color)",
    )
    .or(
      [
        stopIds.length > 0 ? `stop_id.in.(${stopIds.join(",")})` : null,
        routeIds.length > 0 ? `route_id.in.(${routeIds.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(","),
    );

  type NestedStop = { name: string } | { name: string }[] | null;
  type NestedRoute = { name: string; color: string | null } | { name: string; color: string | null }[] | null;
  type JoinedRow = {
    route_id: string;
    stop_id: string;
    vehicle_id: string;
    our_eta_seconds: number | null;
    passio_eta_seconds: number | null;
    computed_at: string;
    stops: NestedStop;
    routes: NestedRoute;
  };

  const pickOne = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const favoriteStopSet = new Set(stopIds);
  const favoriteRouteSet = new Set(routeIds);

  const allRows: InitialEta[] = (
    (etas ?? []) as unknown as JoinedRow[]
  ).map((r) => {
    const stop = pickOne(r.stops);
    const route = pickOne(r.routes);
    const source: "stop" | "route" = favoriteStopSet.has(r.stop_id)
      ? "stop"
      : "route";
    return {
      route_id: r.route_id,
      stop_id: r.stop_id,
      vehicle_id: r.vehicle_id,
      our_eta_seconds: r.our_eta_seconds,
      passio_eta_seconds: r.passio_eta_seconds,
      computed_at: r.computed_at,
      stop_name: stop?.name ?? "Unknown stop",
      route_name: route?.name ?? "Unknown route",
      route_color: route?.color ?? null,
      source,
    };
  });

  // Split into favorite-stop cards (any route arriving at that stop) and
  // favorite-route cards (the soonest stop on that route).
  const stopRows = allRows.filter((r) => favoriteStopSet.has(r.stop_id));
  const routeRows = allRows.filter(
    (r) => !favoriteStopSet.has(r.stop_id) && favoriteRouteSet.has(r.route_id),
  );

  // Empty-state placeholders for favorited things with no live data.
  const stopRowsWithLive = new Set(stopRows.map((r) => r.stop_id));
  const stopPlaceholders: InitialEta[] = (favStops ?? [])
    .filter((f) => !stopRowsWithLive.has(f.stop_id))
    .map((f) => {
      const stop = Array.isArray(f.stops) ? f.stops[0] : f.stops;
      return {
        route_id: "-",
        stop_id: f.stop_id,
        vehicle_id: "-",
        our_eta_seconds: null,
        passio_eta_seconds: null,
        computed_at: new Date().toISOString(),
        stop_name: stop?.name ?? "Unknown stop",
        route_name: "No live bus",
        route_color: null,
        source: "stop" as const,
      };
    });
  const routeRowsWithLive = new Set(routeRows.map((r) => r.route_id));
  const routePlaceholders: InitialEta[] = (favRoutes ?? [])
    .filter((f) => !routeRowsWithLive.has(f.route_id))
    .map((f) => {
      const route = Array.isArray(f.routes) ? f.routes[0] : f.routes;
      return {
        route_id: f.route_id,
        stop_id: "-",
        vehicle_id: "-",
        our_eta_seconds: null,
        passio_eta_seconds: null,
        computed_at: new Date().toISOString(),
        stop_name: "(no stop — route not currently running)",
        route_name: route?.name ?? "Unknown route",
        route_color: route?.color ?? null,
        source: "route" as const,
      };
    });

  const initial = [...stopRows, ...routeRows, ...stopPlaceholders, ...routePlaceholders];

  // Load map data scoped to favorited routes for the dashboard mini-map.
  const focusRouteIds = new Set<string>(routeIds);
  // Also include routes that serve favorited stops.
  if (stopIds.length > 0) {
    const { data: stopRoutes } = await supabase
      .from("route_stops")
      .select("route_id")
      .in("stop_id", stopIds);
    for (const r of stopRoutes ?? []) focusRouteIds.add(r.route_id);
  }
  const focusRouteList = [...focusRouteIds];

  type MiniMapData = {
    vehicles: {
      id: string;
      route_id: string | null;
      lat: number;
      lon: number;
      heading: number | null;
      rolling_speed_mps: number | null;
      updated_at: string;
      out_of_service: boolean;
    }[];
    routes: { id: string; name: string; color: string | null; polyline: [number, number][] }[];
    stops: { id: string; name: string; lat: number; lon: number; route_ids: string[] }[];
  };

  let miniMapData: MiniMapData | null = null;
  if (focusRouteList.length > 0) {
    const [{ data: mvehicles }, { data: mroutes }, { data: mrouteStops }, { data: mstops }] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, route_id, lat, lon, heading, rolling_speed_mps, updated_at, out_of_service")
        .in("route_id", focusRouteList),
      supabase
        .from("routes")
        .select("id, name, color, polyline")
        .in("id", focusRouteList),
      supabase.from("route_stops").select("route_id, stop_id").in("route_id", focusRouteList),
      supabase.from("stops").select("id, name, lat, lon"),
    ]);
    const stopIdSet = new Set((mrouteStops ?? []).map((rs) => rs.stop_id));
    const routesByStop = new Map<string, string[]>();
    for (const rs of mrouteStops ?? []) {
      const list = routesByStop.get(rs.stop_id) ?? [];
      list.push(rs.route_id);
      routesByStop.set(rs.stop_id, list);
    }
    miniMapData = {
      vehicles: (mvehicles ?? []).map((v) => ({ ...v })),
      routes: (mroutes ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        polyline: (r.polyline as [number, number][] | null) ?? [],
      })),
      stops: (mstops ?? [])
        .filter((s) => stopIdSet.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          route_ids: routesByStop.get(s.id) ?? [],
        })),
    };
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">Your shuttle</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live countdowns for your favorite stops and routes. Passio&apos;s own
        ETA is shown underneath for comparison — green when we agree, red when
        we don&apos;t.
      </p>
      <div className="mt-4">
        <Dashboard initial={initial} />
      </div>
      {miniMapData && miniMapData.routes.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Live map</h2>
            <Link href="/map" className="text-sm text-accent hover:text-accent-hover">
              Full map →
            </Link>
          </div>
          <MiniMapLoader data={miniMapData} />
        </section>
      )}
    </main>
  );
}
