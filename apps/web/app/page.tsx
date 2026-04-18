import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import Dashboard, { type InitialEta } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-bold text-maroon">UChicago Shuttle ETA</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Transparent ETAs for UChicago shuttles. We compute arrival times from
          live bus positions so you don&apos;t have to trust Passio&apos;s
          guess.
        </p>
        <p className="mt-4">
          <Link
            href="/sign-in"
            className="inline-block rounded bg-maroon px-4 py-2 font-medium text-white hover:bg-maroon-700"
          >
            Sign in
          </Link>{" "}
          to favorite stops and routes and see live countdowns.
        </p>
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
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">Your shuttle</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Favorite{" "}
          <Link href="/routes" className="text-maroon underline">
            routes
          </Link>{" "}
          or{" "}
          <Link href="/stops" className="text-maroon underline">
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

  const allRows: (InitialEta & { _source: "stop" | "route" })[] = (
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
      _source: source,
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
      };
    });

  const initial = [...stopRows, ...routeRows, ...stopPlaceholders, ...routePlaceholders];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Your shuttle</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live countdowns for your favorite stops and routes. Passio&apos;s own
        ETA is shown underneath for comparison — green when we agree, red when
        we don&apos;t.
      </p>
      <div className="mt-4">
        <Dashboard initial={initial} />
      </div>
    </main>
  );
}
