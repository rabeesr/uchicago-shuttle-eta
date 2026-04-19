import { auth } from "@clerk/nextjs/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import StopsBrowser, {
  type BrowseStop,
  type RouteChip,
} from "@/components/StopsBrowser";

export const dynamic = "force-dynamic";

export default async function StopsPage() {
  const { userId } = await auth();
  const supabase = await getSupabaseServer();

  const [{ data: stops }, { data: routeStops }, { data: routes }, { data: favs }] =
    await Promise.all([
      supabase.from("stops").select("id, name"),
      supabase.from("route_stops").select("route_id, stop_id"),
      supabase.from("routes").select("id, name, color"),
      userId
        ? supabase.from("user_favorite_stops").select("stop_id")
        : Promise.resolve({ data: [] as { stop_id: string }[] }),
    ]);

  const routesById = new Map((routes ?? []).map((r) => [r.id, r]));
  const routesPerStop = new Map<string, BrowseStop["routes"]>();
  for (const rs of routeStops ?? []) {
    const r = routesById.get(rs.route_id);
    if (!r) continue;
    const list = routesPerStop.get(rs.stop_id) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    routesPerStop.set(rs.stop_id, list);
  }

  // Only surface stops that belong to at least one known route — orphans
  // from deleted CTA routes would otherwise clutter the list.
  const browseStops: BrowseStop[] = (stops ?? [])
    .filter((s) => (routesPerStop.get(s.id) ?? []).length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      routes: routesPerStop.get(s.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const routeChips: RouteChip[] = (routes ?? [])
    .map((r) => ({ id: r.id, name: r.name, color: r.color }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const initialFavorites = (favs ?? []).map((f) => f.stop_id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">Browse stops</h1>
      <p className="mt-1 text-sm text-gray-500">
        {userId
          ? "Filter by route to narrow down, then star the stops you use."
          : "Sign in to favorite stops."}
      </p>
      <div className="mt-4">
        <StopsBrowser
          stops={browseStops}
          routes={routeChips}
          initialFavorites={initialFavorites}
          signedIn={!!userId}
        />
      </div>
    </main>
  );
}
