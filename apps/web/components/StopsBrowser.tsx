"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";

export interface BrowseStop {
  id: string;
  name: string;
  routes: Array<{ id: string; name: string; color: string | null }>;
}

export interface RouteChip {
  id: string;
  name: string;
  color: string | null;
}

export default function StopsBrowser({
  stops,
  routes,
  initialFavorites,
  signedIn,
}: {
  stops: BrowseStop[];
  routes: RouteChip[];
  initialFavorites: string[];
  signedIn: boolean;
}) {
  const supabase = useSupabaseBrowser();
  const { userId } = useAuth();
  const [query, setQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(initialFavorites),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let rows = stops;
    if (routeFilter) {
      rows = rows.filter((s) => s.routes.some((r) => r.id === routeFilter));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.routes.some((r) => r.name.toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [stops, query, routeFilter]);

  async function toggle(stopId: string) {
    if (!signedIn || !userId) {
      window.location.href = `/sign-in?redirect_url=/stops`;
      return;
    }
    const wasFav = favorites.has(stopId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
    setPending((prev) => new Set(prev).add(stopId));

    if (wasFav) {
      const { error } = await supabase
        .from("user_favorite_stops")
        .delete()
        .eq("stop_id", stopId);
      if (error) {
        setFavorites((prev) => new Set(prev).add(stopId));
      }
    } else {
      const { error } = await supabase
        .from("user_favorite_stops")
        .insert({ user_id: userId, stop_id: stopId });
      if (error) {
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(stopId);
          return next;
        });
      }
    }
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(stopId);
      return next;
    });
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search stops or routes..."
        className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRouteFilter(null)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            routeFilter === null
              ? "border-accent bg-accent text-white"
              : "border-gray-300 text-gray-700 hover:border-accent hover:text-accent"
          }`}
        >
          All routes
        </button>
        {routes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRouteFilter(r.id === routeFilter ? null : r.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              routeFilter === r.id
                ? "text-white"
                : "border border-gray-300 text-gray-700 hover:text-accent"
            }`}
            style={
              routeFilter === r.id
                ? { backgroundColor: r.color ?? "#666", borderColor: r.color ?? "#666" }
                : undefined
            }
          >
            {r.name}
          </button>
        ))}
      </div>
      <ul className="mt-4 divide-y divide-gray-200">
        {filtered.map((s) => {
          const isFav = favorites.has(s.id);
          const isPending = pending.has(s.id);
          return (
            <li key={s.id} className="flex items-start justify-between py-3">
              <div className="min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.routes.map((r) => (
                    <span
                      key={r.id}
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: r.color ?? "#666" }}
                    >
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                disabled={isPending}
                aria-pressed={isFav}
                className={`ml-3 shrink-0 rounded px-3 py-1 text-sm font-medium transition ${
                  isFav
                    ? "bg-accent text-white hover:bg-accent-hover"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                } ${isPending ? "opacity-60" : ""}`}
              >
                {isFav ? "Favorited" : "Favorite"}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="py-6 text-sm text-gray-500">
            No stops match &ldquo;{query}&rdquo;.
          </li>
        )}
      </ul>
    </div>
  );
}
