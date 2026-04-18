import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import LiveMapLoader from "@/components/LiveMapLoader";
import type { VehicleRow, RoutePolyline } from "@/components/LiveMap";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { userId } = await auth();
  const supabase = await getSupabaseServer();

  const [{ data: vehicles }, { data: routes }, { data: favs }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, route_id, lat, lon, heading, rolling_speed_mps, updated_at, out_of_service"),
    supabase.from("routes").select("id, name, color, polyline"),
    userId
      ? supabase.from("user_favorite_routes").select("route_id")
      : Promise.resolve({ data: [] as { route_id: string }[] }),
  ]);

  const initialVehicles: VehicleRow[] = (vehicles ?? []).map((v) => ({
    id: v.id,
    route_id: v.route_id,
    lat: v.lat,
    lon: v.lon,
    heading: v.heading,
    rolling_speed_mps: v.rolling_speed_mps,
    updated_at: v.updated_at,
    out_of_service: v.out_of_service,
  }));

  const routePolylines: RoutePolyline[] = (routes ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    polyline: (r.polyline as [number, number][] | null) ?? [],
  }));

  const favoriteRouteIds = (favs ?? []).map((f) => f.route_id);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <h1 className="mb-2 text-2xl font-bold">Live map</h1>
      <p className="mb-4 text-sm text-gray-500">
        {favoriteRouteIds.length > 0
          ? "Showing your favorited routes — toggle the chips to add or remove others."
          : "Click a route chip to focus on it. Click again to remove. No chips selected means all routes are visible."}
      </p>
      <LiveMapLoader
        initialVehicles={initialVehicles}
        routes={routePolylines}
        favoriteRouteIds={favoriteRouteIds}
      />
    </main>
  );
}
