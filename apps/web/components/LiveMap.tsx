"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

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

// UChicago campus center
const UCHICAGO_CENTER: [number, number] = [41.789, -87.6];

export default function LiveMap({
  initialVehicles,
  routes,
}: {
  initialVehicles: VehicleRow[];
  routes: RoutePolyline[];
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [vehicles, setVehicles] = useState<Record<string, VehicleRow>>(() =>
    Object.fromEntries(initialVehicles.map((v) => [v.id, v])),
  );
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
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
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const routesById = useMemo(
    () => new Map(routes.map((r) => [r.id, r])),
    [routes],
  );

  return (
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
          r.polyline.length > 1 ? (
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
          .filter((v) => !v.out_of_service)
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
                      <div>
                        {(v.rolling_speed_mps * 2.237).toFixed(1)} mph
                      </div>
                    )}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
      </MapContainer>
    </div>
  );
}
