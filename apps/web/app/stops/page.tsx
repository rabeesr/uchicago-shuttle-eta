import { getSupabaseServer } from "@/lib/supabase-server";
import StopsBrowser, { type BrowseStop } from "@/components/StopsBrowser";

export const dynamic = "force-dynamic";

export default async function StopsPage() {
  const supabase = await getSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: stops }, { data: routeStops }, { data: routes }, { data: favs }] =
    await Promise.all([
      supabase.from("stops").select("id, name"),
      supabase.from("route_stops").select("route_id, stop_id"),
      supabase.from("routes").select("id, name, color"),
      user
        ? supabase.from("user_favorite_stops").select("stop_id").eq("user_id", user.id)
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

  const browseStops: BrowseStop[] = (stops ?? [])
    .map((s) => ({
      id: s.id,
      name: s.name,
      routes: routesPerStop.get(s.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const initialFavorites = (favs ?? []).map((f) => f.stop_id);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Browse stops</h1>
      <p className="mt-1 text-sm text-gray-500">
        {user
          ? "Favorite the stops you use. They'll show up on your home page with live countdowns."
          : "Sign in to favorite stops and get live countdowns."}
      </p>
      <div className="mt-4">
        <StopsBrowser
          stops={browseStops}
          initialFavorites={initialFavorites}
          signedIn={!!user}
        />
      </div>
    </main>
  );
}
