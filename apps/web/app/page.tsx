import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase-server";
import Dashboard, { type InitialEta } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
            href="/auth"
            className="inline-block rounded bg-maroon px-4 py-2 font-medium text-white hover:bg-maroon-700"
          >
            Sign in
          </Link>{" "}
          to favorite stops and see live countdowns.
        </p>
      </main>
    );
  }

  // Get favorite stops + joined stop + current ETAs.
  const { data: favs } = await supabase
    .from("user_favorite_stops")
    .select("stop_id, stops(id, name)")
    .eq("user_id", user.id);

  const stopIds = (favs ?? []).map((f) => f.stop_id);
  if (stopIds.length === 0) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">Your stops</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          You haven&apos;t favorited any stops yet.{" "}
          <Link href="/stops" className="text-maroon underline">
            Browse stops
          </Link>{" "}
          to get started.
        </p>
      </main>
    );
  }

  const { data: etas } = await supabase
    .from("stop_etas")
    .select(
      "route_id, stop_id, vehicle_id, our_eta_seconds, passio_eta_seconds, computed_at, stops(name), routes(name, color)",
    )
    .in("stop_id", stopIds);

  // Supabase's generated types treat foreign-table selects as arrays even when
  // the relation is 1:1, so coerce defensively.
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

  const initial: InitialEta[] = ((etas ?? []) as unknown as JoinedRow[]).map((r) => {
    const stop = pickOne(r.stops);
    const route = pickOne(r.routes);
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
    };
  });

  // Also surface empty-eta cards for favorited stops that have no live bus.
  const withLive = new Set(initial.map((i) => i.stop_id));
  const emptyRows: InitialEta[] = (favs ?? [])
    .filter((f) => !withLive.has(f.stop_id))
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold">Your stops</h1>
      <p className="mt-1 text-sm text-gray-500">
        Countdowns tick in real time. Passio&apos;s own ETA is shown underneath
        for comparison — green when we agree, red when we don&apos;t.
      </p>
      <div className="mt-4">
        <Dashboard initial={[...initial, ...emptyRows]} />
      </div>
    </main>
  );
}
