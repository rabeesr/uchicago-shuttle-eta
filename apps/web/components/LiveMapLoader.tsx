"use client";

import dynamic from "next/dynamic";
import type { VehicleRow, RoutePolyline } from "./LiveMap";

const LiveMap = dynamic(() => import("./LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
      Loading map...
    </div>
  ),
});

export default function LiveMapLoader(props: {
  initialVehicles: VehicleRow[];
  routes: RoutePolyline[];
  favoriteRouteIds: string[];
}) {
  return <LiveMap {...props} />;
}
