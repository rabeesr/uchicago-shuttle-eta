"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";

export interface BrowseRoute {
  id: string;
  name: string;
  short_name: string | null;
  color: string | null;
  stop_count: number;
  has_live_bus: boolean;
}

export default function RoutesBrowser({
  routes,
  initialFavorites,
  signedIn,
}: {
  routes: BrowseRoute[];
  initialFavorites: string[];
  signedIn: boolean;
}) {
  const supabase = useSupabaseBrowser();
  const { userId } = useAuth();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(initialFavorites),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.short_name ?? "").toLowerCase().includes(q),
    );
  }, [routes, query]);

  async function toggle(routeId: string) {
    if (!signedIn || !userId) {
      window.location.href = `/sign-in?redirect_url=/routes`;
      return;
    }
    const wasFav = favorites.has(routeId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
    setPending((prev) => new Set(prev).add(routeId));

    if (wasFav) {
      const { error } = await supabase
        .from("user_favorite_routes")
        .delete()
        .eq("route_id", routeId);
      if (error) setFavorites((p) => new Set(p).add(routeId));
    } else {
      const { error } = await supabase
        .from("user_favorite_routes")
        .insert({ user_id: userId, route_id: routeId });
      if (error) {
        setFavorites((p) => {
          const next = new Set(p);
          next.delete(routeId);
          return next;
        });
      }
    }

    setPending((p) => {
      const next = new Set(p);
      next.delete(routeId);
      return next;
    });
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search routes..."
        className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <ul className="mt-4 divide-y divide-gray-200">
        {filtered.map((r) => {
          const isFav = favorites.has(r.id);
          const isPending = pending.has(r.id);
          return (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3">
              <Link
                href={`/routes/${r.id}`}
                className="-mx-2 flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-gray-50"
              >
                <span
                  className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: r.color ?? "#666" }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="font-medium hover:text-accent">{r.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    {r.short_name && <span>{r.short_name}</span>}
                    <span>·</span>
                    <span>{r.stop_count} stops</span>
                    {r.has_live_bus && (
                      <>
                        <span>·</span>
                        <span className="text-green-600">live</span>
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    tap for timetable + map →
                  </div>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => toggle(r.id)}
                disabled={isPending}
                aria-pressed={isFav}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  isFav
                    ? "bg-accent text-white hover:bg-accent-hover"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                } ${isPending ? "opacity-60" : ""}`}
              >
                {isFav ? "★ Favorited" : "☆ Favorite"}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="py-6 text-sm text-gray-500">
            No routes match &ldquo;{query}&rdquo;.
          </li>
        )}
      </ul>
    </div>
  );
}
