"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline } from "react-leaflet";
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

const UCHICAGO_CENTER: [number, number] = [41.789, -87.6];

export default function LiveMap({
  initialVehicles,
  routes,
  favoriteRouteIds,
}: {
  initialVehicles: VehicleRow[];
  routes: RoutePolyline[];
  favoriteRouteIds: string[];
}) {
  const { isSignedIn } = useAuth();
  const supabase = useSupabaseBrowser();
  const anon = useMemo(() => getSupabaseAnon(), []);
  // Use the Clerk-aware client if signed in (for any writes later), else anon.
  const realtimeClient = isSignedIn ? supabase : anon;

  const [vehicles, setVehicles] = useState<Record<string, VehicleRow>>(() =>
    Object.fromEntries(initialVehicles.map((v) => [v.id, v])),
  );

  // If the user has favorites, default to showing only those. Otherwise show
  // all routes. "visibleRoutes = null" means show all.
  const [visibleRoutes, setVisibleRoutes] = useState<Set<string> | null>(() => {
    if (favoriteRouteIds.length === 0) return null;
    return new Set(favoriteRouteIds);
  });

  useEffect(() => {
    const channel = realtimeClient
      .channel("vehicles:map")
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

  const routesById = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes],
  );

  const isVisible = (routeId: string | null) =>
    visibleRoutes === null || (routeId !== null && visibleRoutes.has(routeId));

  const toggleRoute = (id: string) => {
    setVisibleRoutes((prev) => {
      if (prev === null) {
        // Currently "all visible"; hide all then re-enable the clicked one.
        return new Set([id]);
      }
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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setVisibleRoutes(null)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            visibleRoutes === null
              ? "border-maroon bg-maroon text-white"
              : "border-gray-300 text-gray-700 hover:border-maroon hover:text-maroon dark:border-gray-700 dark:text-gray-300"
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
                  : "border border-gray-300 text-gray-700 hover:text-maroon dark:border-gray-700 dark:text-gray-300"
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

      <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <MapContainer
          center={UCHICAGO_CENTER}
          zoom={15}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {routes.map((r) =>
            r.polyline.length > 1 && isVisible(r.id) ? (
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

          {Object.values(vehicles)
            .filter((v) => !v.out_of_service && isVisible(v.route_id))
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
    </div>
  );
}
