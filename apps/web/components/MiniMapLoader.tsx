"use client";

import dynamic from "next/dynamic";
import type { VehicleRow, RoutePolyline, StopMarker } from "./LiveMap";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[40vh] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-500">
      Loading map…
    </div>
  ),
});

export default function MiniMapLoader({
  data,
}: {
  data: {
    vehicles: VehicleRow[];
    routes: RoutePolyline[];
    stops: StopMarker[];
  };
}) {
  return (
    <LiveMap
      initialVehicles={data.vehicles}
      routes={data.routes}
      stops={data.stops}
      showStops
      showRouteFilterChips={false}
      heightClass="h-[40vh]"
    />
  );
}
