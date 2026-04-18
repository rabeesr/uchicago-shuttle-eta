"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export interface BrowseStop {
  id: string;
  name: string;
  routes: Array<{ id: string; name: string; color: string | null }>;
}

export default function StopsBrowser({
  stops,
  initialFavorites,
  signedIn,
}: {
  stops: BrowseStop[];
  initialFavorites: string[];
  signedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(initialFavorites),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stops;
    return stops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.routes.some((r) => r.name.toLowerCase().includes(q)),
    );
  }, [stops, query]);

  async function toggle(stopId: string) {
    if (!signedIn) {
      window.location.href = `/auth?next=/stops`;
      return;
    }
    const wasFav = favorites.has(stopId);
    // Optimistic update.
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasFav) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
    setPending((prev) => new Set(prev).add(stopId));

    const supabase = getSupabaseBrowser();
    if (wasFav) {
      const { error } = await supabase
        .from("user_favorite_stops")
        .delete()
        .eq("stop_id", stopId);
      if (error) {
        setFavorites((prev) => new Set(prev).add(stopId));
      }
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
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
        className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-maroon focus:outline-none focus:ring-1 focus:ring-maroon dark:border-gray-700 dark:bg-gray-900"
      />
      <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
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
                    ? "bg-maroon text-white hover:bg-maroon-700"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
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
