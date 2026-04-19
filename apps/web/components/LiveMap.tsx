"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useSupabaseBrowser, getSupabaseAnon } from "@/lib/supabase-browser";
import { useAuth } from "@clerk/nextjs";

export interface VehicleRow {
  id: string;
  route_id: string | null;
  lat: number;
  lon: number;
  heading: number | null;
  rolling_speed_mps: number | null;
  updated_at: string;
  out_of_service: boolean;
}

export interface RoutePolyline {
  id: string;
  name: string;
  color: string | null;
  polyline: [number, number][];
}

export interface StopMarker {
  id: string;
  name: string;
  lat: number;
  lon: number;
  route_ids: string[];
}

const UCHICAGO_CENTER: [number, number] = [41.789, -87.6];

function MapFocus({ center, zoom }: { center: [number, number] | null; zoom: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom ?? map.getZoom(), { animate: true });
    }
  }, [center, zoom, map]);
  return null;
}

export default function LiveMap({
  initialVehicles,
  routes,
  stops = [],
  favoriteRouteIds = [],
  showStops = true,
  showRouteFilterChips = true,
  focusCenter = null,
  focusZoom = null,
  routeLockIds = null,
  heightClass = "h-[70vh]",
  stopsAreLinks = true,
}: {
  initialVehicles: VehicleRow[];
  routes: RoutePolyline[];
  stops?: StopMarker[];
  favoriteRouteIds?: string[];
  showStops?: boolean;
  showRouteFilterChips?: boolean;
  focusCenter?: [number, number] | null;
  focusZoom?: number | null;
  /** If set, lock the visible routes to this list (disables the chips). */
  routeLockIds?: string[] | null;
  heightClass?: string;
  stopsAreLinks?: boolean;
}) {
  const { isSignedIn } = useAuth();
  const supabase = useSupabaseBrowser();
  const anon = useMemo(() => getSupabaseAnon(), []);
  const realtimeClient = isSignedIn ? supabase : anon;

  const [vehicles, setVehicles] = useState<Record<string, VehicleRow>>(() =>
    Object.fromEntries(initialVehicles.map((v) => [v.id, v])),
  );

  // visibleRoutes === null means "show all routes". Otherwise, the set of visible ids.
  const [visibleRoutes, setVisibleRoutes] = useState<Set<string> | null>(() => {
    if (routeLockIds !== null) return new Set(routeLockIds);
    if (favoriteRouteIds.length === 0) return null;
    return new Set(favoriteRouteIds);
  });

  useEffect(() => {
    if (routeLockIds !== null) setVisibleRoutes(new Set(routeLockIds));
  }, [routeLockIds]);

  useEffect(() => {
    const channel = realtimeClient
      .channel(`vehicles:map:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        (payload) => {
          const n = payload.new as Partial<VehicleRow> & { id?: string };
          if (!n.id) return;
          setVehicles((prev) => ({
            ...prev,
            [n.id!]: {
              id: n.id!,
              route_id: n.route_id ?? null,
              lat: n.lat ?? 0,
              lon: n.lon ?? 0,
              heading: n.heading ?? null,
              rolling_speed_mps: n.rolling_speed_mps ?? null,
              updated_at: n.updated_at ?? new Date().toISOString(),
              out_of_service: n.out_of_service ?? false,
            },
          }));
        },
      )
      .subscribe();
    return () => {
      realtimeClient.removeChannel(channel);
    };
  }, [realtimeClient]);

  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);

  const isVisibleRoute = (routeId: string | null) =>
    visibleRoutes === null || (routeId !== null && visibleRoutes.has(routeId));

  const toggleRoute = (id: string) => {
    if (routeLockIds !== null) return;
    setVisibleRoutes((prev) => {
      if (prev === null) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? null : next;
    });
  };

  const routesSorted = useMemo(
    () => [...routes].sort((a, b) => a.name.localeCompare(b.name)),
    [routes],
  );

  // A stop is visible if it serves at least one visible route.
  const isVisibleStop = (s: StopMarker) => {
    if (!showStops) return false;
    if (visibleRoutes === null) return true;
    return s.route_ids.some((rid) => visibleRoutes.has(rid));
  };

  return (
    <div>
      {showRouteFilterChips && routeLockIds === null && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibleRoutes(null)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              visibleRoutes === null
                ? "border-accent bg-accent text-white"
                : "border-gray-300 text-gray-700 hover:border-accent hover:text-accent"
            }`}
          >
            All routes
          </button>
          {routesSorted.map((r) => {
            const active = visibleRoutes !== null && visibleRoutes.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRoute(r.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "text-white"
                    : "border border-gray-300 text-gray-700 hover:text-accent"
                }`}
                style={
                  active
                    ? { backgroundColor: r.color ?? "#666", borderColor: r.color ?? "#666" }
                    : undefined
                }
              >
                {r.name}
              </button>
            );
          })}
        </div>
      )}

      <div className={`${heightClass} w-full overflow-hidden rounded-lg border border-gray-200`}>
        <MapContainer
          center={focusCenter ?? UCHICAGO_CENTER}
          zoom={focusZoom ?? 15}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapFocus center={focusCenter} zoom={focusZoom} />

          {routes.map((r) =>
            r.polyline.length > 1 && isVisibleRoute(r.id) ? (
              <Polyline
                key={r.id}
                positions={r.polyline}
                pathOptions={{
                  color: r.color ?? "#888",
                  weight: 3,
                  opacity: 0.6,
                }}
              />
            ) : null,
          )}

          {stops.filter(isVisibleStop).map((s) => {
            const marker = (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.lon]}
                radius={4}
                pathOptions={{
                  color: "#333",
                  weight: 1,
                  fillColor: "#fff",
                  fillOpacity: 0.9,
                }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <div className="text-xs font-medium">{s.name}</div>
                </Tooltip>
              </CircleMarker>
            );
            // react-leaflet doesn't propagate Link wrappers to marker clicks the
            // way HTML would — Leaflet intercepts the event. We set an eventHandler
            // to trigger navigation imperatively.
            return stopsAreLinks ? (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.lon]}
                radius={4}
                pathOptions={{
                  color: "#333",
                  weight: 1,
                  fillColor: "#fff",
                  fillOpacity: 0.9,
                }}
                eventHandlers={{
                  click: () => {
                    window.location.href = `/stops/${s.id}`;
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <div className="text-xs">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-gray-500">click for details</div>
                  </div>
                </Tooltip>
              </CircleMarker>
            ) : (
              marker
            );
          })}

          {Object.values(vehicles)
            .filter((v) => !v.out_of_service && isVisibleRoute(v.route_id))
            .map((v) => {
              const route = v.route_id ? routesById.get(v.route_id) : null;
              const color = route?.color ?? "#800000";
              return (
                <CircleMarker
                  key={v.id}
                  center={[v.lat, v.lon]}
                  radius={7}
                  pathOptions={{
                    color: "#000",
                    weight: 1,
                    fillColor: color,
                    fillOpacity: 0.9,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>
                    <div className="text-xs">
                      <div className="font-semibold">{route?.name ?? "Unknown route"}</div>
                      <div>Bus {v.id}</div>
                      {v.rolling_speed_mps != null && (
                        <div>{(v.rolling_speed_mps * 2.237).toFixed(1)} mph</div>
                      )}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
        </MapContainer>
      </div>

      {stops.length > 0 && showStops && (
        <div className="mt-2 text-center">
          <Link
            href="/stops"
            className="text-xs text-gray-500 hover:text-accent"
          >
            Browse all {stops.length} stops →
          </Link>
        </div>
      )}
    </div>
  );
}
