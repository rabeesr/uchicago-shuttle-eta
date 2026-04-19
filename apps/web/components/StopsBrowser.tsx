"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";
import { useUserLocation } from "@/hooks/useUserLocation";
import { haversineM, walkingSecondsM } from "@/lib/geo";

export interface BrowseStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
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
  const { state: loc, request: requestLoc } = useUserLocation();
  const [query, setQuery] = useState("");
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(initialFavorites),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());
  // Wall-clock tick after mount — keeps "arrive HH:MM" fresh without an SSR
  // mismatch. null during SSR and first client render.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const userLatLon = loc.status === "granted"
    ? { lat: loc.lat, lon: loc.lon }
    : null;

  const showLocPrompt =
    loc.status === "idle" || loc.status === "denied" || loc.status === "unsupported";

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

  // If we have the user's location, enrich + sort by distance (nearest first).
  const enriched = useMemo(() => {
    if (!userLatLon) return filtered.map((s) => ({ ...s, walkSec: null as number | null, distM: null as number | null }));
    return filtered
      .map((s) => {
        const distM = haversineM(userLatLon, { lat: s.lat, lon: s.lon });
        return { ...s, distM, walkSec: walkingSecondsM(distM) };
      })
      .sort((a, b) => (a.distM ?? 1e12) - (b.distM ?? 1e12));
  }, [filtered, userLatLon]);

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
      {showLocPrompt && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-accent-subtle bg-accent-subtle/40 p-3">
          <div className="text-xs text-gray-700">
            <span className="font-medium text-accent">See walking time + arrival time</span>{" "}
            for every stop by sharing your location.
          </div>
          <button
            type="button"
            onClick={requestLoc}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            📍 Use my location
          </button>
        </div>
      )}
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
        {enriched.map((s) => {
          const isFav = favorites.has(s.id);
          const isPending = pending.has(s.id);
          // Build walking + arrival text. Kept empty during SSR (now === null).
          let walkArriveText = "";
          if (s.walkSec != null && now != null) {
            const arriveAt = new Date(now + s.walkSec * 1000);
            const minutes = Math.max(1, Math.ceil(s.walkSec / 60));
            const arriveDisplay = arriveAt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
            walkArriveText = `🚶 ~${minutes} min walk · arrive ${arriveDisplay}`;
          }
          return (
            <li key={s.id} className="flex items-start justify-between gap-3 py-3">
              <Link
                href={`/stops/${s.id}`}
                className="-mx-2 flex min-w-0 flex-1 flex-col gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-gray-50"
              >
                <div className="font-medium hover:text-accent">{s.name}</div>
                <div className="flex flex-wrap gap-1">
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
                {walkArriveText ? (
                  <div className="text-[11px] font-medium text-accent">
                    {walkArriveText}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400">
                    tap for upcoming arrivals →
                  </div>
                )}
              </Link>
              <button
                type="button"
                onClick={() => toggle(s.id)}
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
        {enriched.length === 0 && (
          <li className="py-6 text-sm text-gray-500">
            No stops match &ldquo;{query}&rdquo;.
          </li>
        )}
      </ul>
    </div>
  );
}
