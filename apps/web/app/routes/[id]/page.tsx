import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import LiveMapLoader from "@/components/LiveMapLoader";
import Timetable, { type Arrival } from "@/components/Timetable";
import RouteFavoriteToggle from "@/components/RouteFavoriteToggle";
import NearestStopOnRoute from "@/components/NearestStopOnRoute";
import type { VehicleRow, RoutePolyline, StopMarker } from "@/components/LiveMap";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  const supabase = await getSupabaseServer();

  const [{ data: route }, { data: routeStops }, { data: etas }, { data: vehicles }, { data: stops }, { data: fav }] =
    await Promise.all([
      supabase
        .from("routes")
        .select("id, name, short_name, color, polyline")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("route_stops")
        .select("stop_id, stop_order, arc_distance_m")
        .eq("route_id", id)
        .order("stop_order"),
      supabase
        .from("stop_etas")
        .select(
          "route_id, stop_id, vehicle_id, our_eta_seconds, passio_eta_seconds, computed_at, vehicles(pax_load, rolling_speed_mps), stops(name)",
        )
        .eq("route_id", id),
      supabase
        .from("vehicles")
        .select("id, route_id, lat, lon, heading, rolling_speed_mps, updated_at, out_of_service"),
      supabase.from("stops").select("id, name, lat, lon"),
      userId
        ? supabase
            .from("user_favorite_routes")
            .select("route_id")
            .eq("route_id", id)
            .maybeSingle()
        : Promise.resolve({ data: null as { route_id: string } | null }),
    ]);

  if (!route) notFound();

  type NestedStop = { name: string } | { name: string }[] | null;
  type NestedVehicleOnEta = { pax_load: number | null; rolling_speed_mps: number | null } | Array<{ pax_load: number | null; rolling_speed_mps: number | null }> | null;
  const pickOne = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v;

  const stopsById = new Map((stops ?? []).map((s) => [s.id, s]));
  const orderedRouteStops = (routeStops ?? []).filter((rs) => stopsById.has(rs.stop_id));

  const arrivals: Arrival[] = ((etas ?? []) as Array<{
    route_id: string;
    stop_id: string;
    vehicle_id: string;
    our_eta_seconds: number | null;
    passio_eta_seconds: number | null;
    computed_at: string;
    vehicles: NestedVehicleOnEta;
    stops: NestedStop;
  }>).map((e) => {
    const v = pickOne(e.vehicles);
    const s = pickOne(e.stops);
    return {
      key: `${e.route_id}:${e.stop_id}:${e.vehicle_id}`,
      route_id: e.route_id,
      stop_id: e.stop_id,
      vehicle_id: e.vehicle_id,
      route_name: route.name,
      route_color: route.color,
      stop_name: s?.name ?? e.stop_id,
      our_eta_seconds: e.our_eta_seconds,
      passio_eta_seconds: e.passio_eta_seconds,
      computed_at: e.computed_at,
      pax_load: v?.pax_load ?? null,
      bus_speed_mps: v?.rolling_speed_mps ?? null,
    };
  });

  const routePolylines: RoutePolyline[] = [
    {
      id: route.id,
      name: route.name,
      color: route.color,
      polyline: (route.polyline as [number, number][] | null) ?? [],
    },
  ];

  const stopMarkers: StopMarker[] = orderedRouteStops.map((rs) => {
    const s = stopsById.get(rs.stop_id)!;
    return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, route_ids: [route.id] };
  });

  const vehicleRows: VehicleRow[] = (vehicles ?? [])
    .filter((v) => v.route_id === route.id)
    .map((v) => ({ ...v }));

  // Compute a default map viewport from the polyline bounds.
  const poly = routePolylines[0].polyline;
  let center: [number, number] | null = null;
  if (poly.length > 0) {
    let sumLat = 0, sumLon = 0;
    for (const [la, lo] of poly) { sumLat += la; sumLon += lo; }
    center = [sumLat / poly.length, sumLon / poly.length];
  }

  const stopsForNearest = stopMarkers.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <Link href="/routes" className="text-sm text-gray-500 hover:text-accent">
          ← all routes
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span
              className="inline-block h-4 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: route.color ?? "#666" }}
              aria-hidden
            />
            <h1 className="text-3xl font-bold">{route.name}</h1>
          </div>
          {route.short_name && (
            <div className="mt-1 text-sm text-gray-500">{route.short_name}</div>
          )}
          <div className="mt-2 text-xs text-gray-500">
            {stopMarkers.length} stops · {vehicleRows.filter((v) => !v.out_of_service).length} live bus{vehicleRows.filter((v) => !v.out_of_service).length === 1 ? "" : "es"}
          </div>
        </div>
        {userId && <RouteFavoriteToggle routeId={id} initiallyFavorited={!!fav} />}
      </div>

      <NearestStopOnRoute stops={stopsForNearest} className="mt-4" />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-semibold">Next arrivals by stop</h2>
          <Timetable
            initial={arrivals}
            filter={{ routeId: id }}
            emptyMessage="No live predictions right now — the route may not be running."
            groupBy="stop"
          />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Live map</h2>
          <LiveMapLoader
            initialVehicles={vehicleRows}
            routes={routePolylines}
            stops={stopMarkers}
            routeLockIds={[route.id]}
            showStops
            showRouteFilterChips={false}
            focusCenter={center}
            focusZoom={14}
            heightClass="h-[50vh]"
          />
        </section>
      </div>
    </main>
  );
}
