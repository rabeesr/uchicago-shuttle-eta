import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseServer } from "@/lib/supabase-server";
import LiveMapLoader from "@/components/LiveMapLoader";
import Timetable, { type Arrival } from "@/components/Timetable";
import StopFavoriteToggle from "@/components/StopFavoriteToggle";
import { auth } from "@clerk/nextjs/server";
import type { VehicleRow, RoutePolyline, StopMarker } from "@/components/LiveMap";
import LeaveByChip from "@/components/LeaveByChip";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await getSupabaseServer();
  const { data: stop } = await supabase.from("stops").select("name").eq("id", id).maybeSingle();
  const title = stop?.name ? `${stop.name} — Shuttle ETA` : "Shuttle ETA";
  const description = "Live UChicago shuttle arrivals at this stop, with transparent ETAs.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function StopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  const supabase = await getSupabaseServer();

  const [{ data: stop }, { data: serving }, { data: etas }, { data: vehicles }, { data: routes }, { data: allStops }, { data: fav }] =
    await Promise.all([
      supabase.from("stops").select("id, name, lat, lon").eq("id", id).maybeSingle(),
      supabase
        .from("route_stops")
        .select("route_id, routes(id, name, color)")
        .eq("stop_id", id),
      supabase
        .from("stop_etas")
        .select(
          "route_id, stop_id, vehicle_id, our_eta_seconds, passio_eta_seconds, computed_at, vehicles(pax_load, rolling_speed_mps), routes(name, color)",
        )
        .eq("stop_id", id),
      supabase
        .from("vehicles")
        .select("id, route_id, lat, lon, heading, rolling_speed_mps, updated_at, out_of_service"),
      supabase.from("routes").select("id, name, color, polyline"),
      supabase.from("stops").select("id, name, lat, lon"),
      userId
        ? supabase.from("user_favorite_stops").select("stop_id").eq("stop_id", id).maybeSingle()
        : Promise.resolve({ data: null as { stop_id: string } | null }),
    ]);

  if (!stop) notFound();

  type NestedRoute = { id: string; name: string; color: string | null } | Array<{ id: string; name: string; color: string | null }> | null;
  type NestedRouteOnEta = { name: string; color: string | null } | Array<{ name: string; color: string | null }> | null;
  type NestedVehicleOnEta = { pax_load: number | null; rolling_speed_mps: number | null } | Array<{ pax_load: number | null; rolling_speed_mps: number | null }> | null;
  const pickOne = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v;

  const servingRoutes = ((serving ?? []) as Array<{ route_id: string; routes: NestedRoute }>)
    .map((rs) => pickOne(rs.routes))
    .filter((r): r is { id: string; name: string; color: string | null } => !!r);

  const arrivals: Arrival[] = ((etas ?? []) as Array<{
    route_id: string;
    stop_id: string;
    vehicle_id: string;
    our_eta_seconds: number | null;
    passio_eta_seconds: number | null;
    computed_at: string;
    vehicles: NestedVehicleOnEta;
    routes: NestedRouteOnEta;
  }>).map((e) => {
    const v = pickOne(e.vehicles);
    const r = pickOne(e.routes);
    return {
      key: `${e.route_id}:${e.stop_id}:${e.vehicle_id}`,
      route_id: e.route_id,
      stop_id: e.stop_id,
      vehicle_id: e.vehicle_id,
      route_name: r?.name ?? e.route_id,
      route_color: r?.color ?? null,
      stop_name: stop.name,
      stop_lat: stop.lat,
      stop_lon: stop.lon,
      our_eta_seconds: e.our_eta_seconds,
      passio_eta_seconds: e.passio_eta_seconds,
      computed_at: e.computed_at,
      pax_load: v?.pax_load ?? null,
      bus_speed_mps: v?.rolling_speed_mps ?? null,
    };
  });

  const routePolylines: RoutePolyline[] = (routes ?? [])
    .filter((r) => servingRoutes.some((s) => s.id === r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      polyline: (r.polyline as [number, number][] | null) ?? [],
    }));

  const stopMarkers: StopMarker[] = (allStops ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
    route_ids: [],
  }));

  const vehicleRows: VehicleRow[] = (vehicles ?? []).map((v) => ({ ...v }));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <Link href="/stops" className="text-sm text-gray-500 hover:text-accent">
          ← all stops
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{stop.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {servingRoutes.map((r) => (
              <Link
                key={r.id}
                href={`/routes/${r.id}`}
                className="inline-block rounded-full px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                style={{ backgroundColor: r.color ?? "#666" }}
              >
                {r.name}
              </Link>
            ))}
          </div>
        </div>
        {userId && (
          <StopFavoriteToggle stopId={id} initiallyFavorited={!!fav} />
        )}
      </div>

      {(() => {
        const soonest = arrivals
          .filter((a) => a.our_eta_seconds != null)
          .sort((a, b) => (a.our_eta_seconds ?? 1e9) - (b.our_eta_seconds ?? 1e9))[0];
        return (
          <LeaveByChip
            stopLat={stop.lat}
            stopLon={stop.lon}
            nextArrivalSeconds={soonest?.our_eta_seconds ?? null}
            nextArrivalComputedAt={soonest?.computed_at ?? null}
            className="mt-4"
          />
        );
      })()}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-semibold">Upcoming arrivals</h2>
          <Timetable
            initial={arrivals}
            filter={{ stopId: id }}
            emptyMessage="No buses are approaching this stop right now."
            stopsById={{ [id]: { name: stop.name, lat: stop.lat, lon: stop.lon } }}
            routesById={Object.fromEntries(
              servingRoutes.map((r) => [r.id, { name: r.name, color: r.color }]),
            )}
          />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Live map</h2>
          <LiveMapLoader
            initialVehicles={vehicleRows}
            routes={routePolylines}
            stops={stopMarkers}
            routeLockIds={servingRoutes.map((r) => r.id)}
            showStops
            showRouteFilterChips={false}
            focusCenter={[stop.lat, stop.lon]}
            focusZoom={17}
            heightClass="h-[50vh]"
          />
        </section>
      </div>
    </main>
  );
}
