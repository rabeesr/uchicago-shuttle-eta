import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import LiveMapLoader from "@/components/LiveMapLoader";
import type { VehicleRow, RoutePolyline, StopMarker } from "@/components/LiveMap";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { userId } = await auth();
  const supabase = await getSupabaseServer();

  const [
    { data: vehicles },
    { data: routes },
    { data: stops },
    { data: routeStops },
    { data: favs },
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, route_id, lat, lon, heading, rolling_speed_mps, updated_at, out_of_service"),
    supabase.from("routes").select("id, name, color, polyline"),
    supabase.from("stops").select("id, name, lat, lon"),
    supabase.from("route_stops").select("route_id, stop_id"),
    userId
      ? supabase.from("user_favorite_routes").select("route_id")
      : Promise.resolve({ data: [] as { route_id: string }[] }),
  ]);

  const initialVehicles: VehicleRow[] = (vehicles ?? []).map((v) => ({ ...v }));
  const routePolylines: RoutePolyline[] = (routes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    polyline: (r.polyline as [number, number][] | null) ?? [],
  }));

  // Build stop → route_ids map from route_stops, then filter to stops that
  // belong to at least one known (non-CTA) route.
  const routesByStop = new Map<string, string[]>();
  for (const rs of routeStops ?? []) {
    const list = routesByStop.get(rs.stop_id) ?? [];
    list.push(rs.route_id);
    routesByStop.set(rs.stop_id, list);
  }
  const stopMarkers: StopMarker[] = (stops ?? [])
    .filter((s) => (routesByStop.get(s.id) ?? []).length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      route_ids: routesByStop.get(s.id) ?? [],
    }));

  const favoriteRouteIds = (favs ?? []).map((f) => f.route_id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">Live map</h1>
      <p className="mb-4 text-sm text-gray-500">
        {favoriteRouteIds.length > 0
          ? "Showing your favorited routes — toggle chips to add or remove. Click a stop marker for its timetable."
          : "Click a route chip to focus, or a stop for its timetable."}
      </p>
      <LiveMapLoader
        initialVehicles={initialVehicles}
        routes={routePolylines}
        stops={stopMarkers}
        favoriteRouteIds={favoriteRouteIds}
        showStops
      />
    </main>
  );
}
