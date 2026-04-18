import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import RoutesBrowser, {
  type BrowseRoute,
} from "@/components/RoutesBrowser";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const { userId } = await auth();
  const supabase = await getSupabaseServer();

  const [{ data: routes }, { data: routeStops }, { data: vehicles }, { data: favs }] =
    await Promise.all([
      supabase.from("routes").select("id, name, short_name, color"),
      supabase.from("route_stops").select("route_id, stop_id"),
      supabase.from("vehicles").select("route_id, out_of_service"),
      userId
        ? supabase.from("user_favorite_routes").select("route_id")
        : Promise.resolve({ data: [] as { route_id: string }[] }),
    ]);

  const stopCountByRoute = new Map<string, number>();
  for (const rs of routeStops ?? []) {
    stopCountByRoute.set(rs.route_id, (stopCountByRoute.get(rs.route_id) ?? 0) + 1);
  }
  const liveRoutes = new Set(
    (vehicles ?? [])
      .filter((v) => !v.out_of_service && v.route_id)
      .map((v) => v.route_id as string),
  );

  const browseRoutes: BrowseRoute[] = (routes ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      short_name: r.short_name,
      color: r.color,
      stop_count: stopCountByRoute.get(r.id) ?? 0,
      has_live_bus: liveRoutes.has(r.id),
    }))
    // Surface running routes first, then by name.
    .sort((a, b) => {
      if (a.has_live_bus !== b.has_live_bus) return a.has_live_bus ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const initialFavorites = (favs ?? []).map((f) => f.route_id);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Routes</h1>
      <p className="mt-1 text-sm text-gray-500">
        {userId
          ? "Favorite the routes you ride. The home page will show a countdown for the next bus on each of them."
          : "Sign in to favorite routes."}
      </p>
      <div className="mt-4">
        <RoutesBrowser
          routes={browseRoutes}
          initialFavorites={initialFavorites}
          signedIn={!!userId}
        />
      </div>
    </main>
  );
}
